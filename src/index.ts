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

export const createPaginatedQuery = (
  options: PaginatedQueryOptions
): PaginatedQuery => {
  const { client, filter, projection, pageSize } = options;
  const [order, direction] = options.order;

  let currentPage: number | undefined;
  let lastMax: string | undefined;
  let lastMin: string | undefined;

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

  // This operation can be expensive, and will get slower the higher the page
  // number. Should only be used when you know the page you want to go to, or
  // to load an initial page. Browsing should be done with nextPage and
  // previousPage
  const getPage = (page: number) => {
    const start = page * pageSize;
    const end = start + pageSize;
    lastMax = undefined;
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
        lastMin = results[0][order];
        lastMax = results[results.length - 1][order];
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
          order + ' > ' + lastMax,
          0,
          pageSize
        )
      )
      .then((results) => {
        currentPage = currentPage ? currentPage + 1 : 0;
        lastMin = results[0][order];
        lastMax = results[results.length - 1][order];
        return results;
      });
  };

  const previousPage = async () => {
    if (currentPage === undefined) return getPage(0);
    const inverseDirection = direction === 'asc' ? 'desc' : 'asc';
    const previousPageQuery = `
*[${filter} && ${order} < ${lastMin}] | order(${order} ${inverseDirection}) {
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
        lastMin = results[0][order];
        lastMax = results[results.length - 1][order];
        return results;
      });
  }

  /**
  * This is an expensive operation, and should only be used when you absolutely
  * need to know the total number of pages. It will fetch all documents that
  * match the filter, de-dupe them, and then count them. This is potentially a
  * 1+n operation.
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
