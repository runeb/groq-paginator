import type { SanityDocument } from "@sanity/client";

interface PaginatedQueryOptions {
  client: {
    fetch: (
      query: string,
      params?: Record<string, any>
    ) => Promise<SanityDocument[]>;
  };
  query: string;
  filter: string;
  projection: string;
  order: [string, "asc" | "desc"];
  pageSize: number;
}

interface PaginatedQuery {
  getPage: (page: number) => Promise<SanityDocument[]>;
  nextPage: () => Promise<SanityDocument[]>;
}

export const createPaginatedQuery = (
  options: PaginatedQueryOptions
): PaginatedQuery => {
  const { client, filter, projection, pageSize } = options;
  const [order, direction] = options.order;

  let currentPage: number | undefined;
  let lastMax: string | undefined;

  const query = (
    filter: string,
    order: string,
    direction: string,
    lastMax: string | undefined,
    start: number,
    end: number
  ) => `
*[${filter} ${lastMax ? `&& ${order} > ${lastMax}` : ''}] | order(${order} ${direction}) {
    "_isDraft": _id in path("drafts.*"),
    "_publishedId": string::split(_id, "drafts.")[1],
    "document": @ {${projection}}
  }[!_isDraft || count(*[_id == ^._publishedId]._id) == 0] {
    ...document,
  } [${start}...${end}]
  `;

  const getPage = (page: number) => {
    const start = page * pageSize;
    const end = start + pageSize;
    lastMax = undefined;
    return client
      .fetch(query(
        filter,
        order,
        direction,
        lastMax,
        start,
        end
      )
      )
      .then((results) => {
        currentPage = page;
        lastMax = results[results.length - 1][order];
        return results;
      });
  };

  const nextPage = async () => {
    if (currentPage === undefined) return getPage(0);
    return client
      .fetch(
        query(
          filter,
          order,
          direction,
          lastMax,
          0,
          pageSize
        )
      )
      .then((results) => {
        currentPage = currentPage ? currentPage + 1 : 0;
        lastMax = results[results.length - 1][order];
        return results;
      });
  };

  return {
    getPage,
    nextPage,
  };
};
