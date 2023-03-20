import { describe, expect, test } from "vitest";
import { parse, evaluate } from "groq-js";
import { createPaginatedQuery } from "../src";
import { createClient } from "@sanity/client";

describe('createPaginatedQuery', () => {
  test('it works with SanityClient', () => {
    createPaginatedQuery({
      client: createClient({
        projectId: 'todo',
        dataset: 'test',
        useCdn: true,
        apiVersion: '2021-03-25'
      }),
      query: '*',
      filter: '_type == "test"',
      order: ['order', 'asc'],
      projection: 'order, _id',
      pageSize: 5,
    })
  })
})
