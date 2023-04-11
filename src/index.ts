import type { SanityDocument } from "@sanity/client";

export interface PaginatedQueryOptions {
  client: {
    fetch<R>(
      query: string,
      params?: Record<string, any>
    ): Promise<R>;
  };
  query: string;
  filter: string;
  projection: string;
  order: [string, "asc" | "desc"];
  pageSize: number;
}

export type PaginatedQuery = {
  getPage: (page: number) => Promise<SanityDocument[]>;
  nextPage: () => Promise<SanityDocument[]>;
  previousPage: () => Promise<SanityDocument[]>;
  numPages: () => Promise<number>;
};

// This function creates a paginated query object that can be used to fetch
// pages of results. The query is implemented by fetching the first page, and
// then using the last result to filter the next page, and so on.  This means
// that the query is not very efficient, and will get slower the higher the page
// number. It is recommended to use this function to get the first page, and
// then use nextPage and previousPage to browse the results.
// See https://www.sanity.io/docs/paginating-with-groq for more information
export const createPaginatedQuery = (
  options: PaginatedQueryOptions
): PaginatedQuery => {
  const { client, filter, projection, pageSize } = options;
  const [order, direction] = options.order;

  let currentPage: number | undefined = undefined;
  let lastOrderFieldMin: string | undefined = undefined;
  let lastOrderFieldMax: string | undefined = undefined;
  let lastMinId: string | undefined = undefined;
  let lastMaxId: string | undefined = undefined;

  const query = (
    filter: string,
    order: string,
    direction: string,
    pageFilter: string | undefined,
    start: number,
    end: number,
  ) => `
*[${filter} ${pageFilter ? `&& ${pageFilter}` : ''}] | order(${order} ${direction}) {
    "_isDraft": _id in path("drafts.*"),
    "_publishedId": string::split(_id, "drafts.")[1],
    "document": @ {${projection}}
  }[!_isDraft || count(*[_id == ^._publishedId]._id) == 0] {
    ...document,
  } [${start}...${end}]
  `;

  const saveBounds = (results: SanityDocument[]) => {
    lastOrderFieldMin = results[0][order];
    lastOrderFieldMax = results[results.length - 1][order];
    lastMinId = results[0]._id;
    lastMaxId = results[results.length - 1]._id;
  };

  // This operation can be expensive, and will get slower the higher the page
  // number. Should only be used when you know the page you want to go to, or
  // to load an initial page. Browsing should be done with nextPage and
  // previousPage. Optimal performance is to get the first page, then use
  // nextPage and previousPage to browse.
  const getPage = (page: number) => {
    const start = page * pageSize;
    const end = start + pageSize;
    return client
      .fetch<SanityDocument[]>(query(
        filter,
        order,
        direction,
        undefined,
        start,
        end
      )
      )
      .then((results) => {
        currentPage = page;
        saveBounds(results);
        return results;
      });
  };

  const nextPage = async () => {
    if (currentPage === undefined) return getPage(0);
    return client
      .fetch<SanityDocument[]>(
        query(
          filter,
          order,
          direction,
          `(${order} > ${lastOrderFieldMax} || (${order} == ${lastOrderFieldMax} && _id > "${lastMaxId}"))`,
          0,
          pageSize
        )
      )
      .then((results) => {
        currentPage = currentPage ? currentPage + 1 : 0;
        saveBounds(results);
        return results;
      });
  };

  const previousPage = async () => {
    if (currentPage === undefined) return getPage(0);
    // Get the inverse sorting of previous documents, then reverse the results
    const inverseDirection = direction === 'asc' ? 'desc' : 'asc';
    const previousPageQuery = `
*[${filter} && (${order} < ${lastOrderFieldMin} || ${order} == ${lastOrderFieldMin} && _id < "${lastMinId}")] | order(${order} ${inverseDirection}) {
    "_isDraft": _id in path("drafts.*"),
    "_publishedId": string::split(_id, "drafts.")[1],
    "document": @ {${projection}}
  }[!_isDraft || count(*[_id == ^._publishedId]._id) == 0] {
    ...document,
  } [0...${pageSize}] | order(${order} ${direction})
  `;
    return client
      .fetch<SanityDocument[]>(
        previousPageQuery
      )
      .then((results) => {
        currentPage = currentPage ? currentPage - 1 : 0;
        saveBounds(results);
        return results;
      });
  }

  /**
  * This is an expensive operation, and should only be used when you absolutely
  * need to know the total number of pages. It will fetch all documents that
  * match the filter, de-dupe them, and then count them. This is potentially a
  * 1+N operation.
  */
  const numPages = async () => {
    const countQuery = `count(*[${filter}] {
    "_isDraft": _id in path("drafts.*"),
    "_publishedId": string::split(_id, "drafts.")[1],
  }[!_isDraft || count(*[_id == ^._publishedId]._id) == 0])`
    return client.fetch<number>(countQuery)
      .then((count) => Math.ceil(count / pageSize));
  };

  return {
    getPage,
    nextPage,
    previousPage,
    numPages,
  };
};
