import { describe, expect, test } from "vitest";
import { parse, evaluate } from "groq-js";
import { createPaginatedQuery } from "../src";
import { SanityDocument } from "@sanity/client";

let dataset = [
  // Page 1
  { _id: "drafts.a", _type: "test", order: 1 },
  { _id: "a", _type: "test", order: 1 },
  { _id: "drafts.b", _type: "test", order: 2 },
  { _id: "b", _type: "test", order: 2 },
  { _id: "c", _type: "test", order: 3 },
  { _id: "drafts.d", _type: "test", order: 4 },
  { _id: "drafts.e", _type: "test", order: 5 },
  { _id: "e", _type: "test", order: 5 },

  // Page 2
  { _id: "drafts.f", _type: "test", order: 6 },
  { _id: "f", _type: "test", order: 6 },
  { _id: "g", _type: "test", order: 7 },
  { _id: "drafts.h", _type: "test", order: 8 },
  { _id: "i", _type: "test", order: 9 },
  { _id: "drafts.i", _type: "test", order: 9 },
  { _id: "j", _type: "test", order: 10 },

  // Page 3
  { _id: "k", _type: "test", order: 11 },
  { _id: "l", _type: "test", order: 12 },
  { _id: "m", _type: "test", order: 13 },
  { _id: "n", _type: "test", order: 14 },
  { _id: "o", _type: "test", order: 15 },

  // Page 4
  { _id: "drafts.p", _type: "test", order: 16 },
  { _id: "drafts.q", _type: "test", order: 17 },
  { _id: "drafts.r", _type: "test", order: 18 },
  { _id: "drafts.s", _type: "test", order: 19 },
  { _id: "drafts.t", _type: "test", order: 20 },

  // Page 5
  { _id: "u", _type: "test", order: 21 },
];

const client = {
  fetch: async (query: string, params?: Record<string, any>): Promise<SanityDocument[]> => {
    let tree = parse(query);
    let value = await evaluate(tree, { dataset });
    let result = await value.get();
    return result;
  },
};

describe("createPaginatedQuery", () => {
  const pq = createPaginatedQuery({
    client: client,
    query: "*",
    filter: '_type == "test"',
    order: ["order", "asc"],
    projection: "order, _id",
    pageSize: 5,
  });

  test("getPage(0)", async () => {
    const res = await pq.getPage(0);
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["a", "b", "c", "drafts.d", "e"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([1, 2, 3, 4, 5]);
  });

  test("getPage(4)", async () => {
    const res = await pq.getPage(4);
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["u"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([21]);
  });

  test("getPage(1)", async () => {
    const res = await pq.getPage(1);
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["f", "g", "drafts.h", "i", "j"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([6, 7, 8, 9, 10]);
  });

  test("nextPage from 0", async () => {
    await pq.getPage(0);
    const res = await pq.nextPage();
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["f", "g", "drafts.h", "i", "j"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([6, 7, 8, 9, 10]);
  })

  test("nextPage x 2 from 0", async () => {
    await pq.getPage(0);
    await pq.nextPage();
    const res = await pq.nextPage();
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["k", "l", "m", "n", "o"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([11, 12, 13, 14, 15]);
  })

  test("nextPage from 1", async () => {
    await pq.getPage(1);
    const res = await pq.nextPage();
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["k", "l", "m", "n", "o"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([11, 12, 13, 14, 15]);
  })

  test("nextPage from 2", async () => {
    await pq.getPage(2);
    const res = await pq.nextPage();
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["drafts.p", "drafts.q", "drafts.r", "drafts.s", "drafts.t"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([16, 17, 18, 19, 20]);
  })

  test('getPage inverse sort order', async () => {
    const pq = createPaginatedQuery({
      client: client,
      query: "*",
      filter: '_type == "test"',
      order: ["order", "desc"],
      projection: "order, _id",
      pageSize: 3,
    })
    const res = await pq.getPage(0);
    const ids = res.map((r: any) => r._id);
    expect(ids).to.eql(["u", "drafts.t", "drafts.s"]);
    const ordering = res.map((r: any) => r.order);
    expect(ordering).to.eql([21, 20, 19]);
  })
});
