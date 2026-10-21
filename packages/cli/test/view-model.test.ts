import { describe, expect, it } from "vitest";
import { DATA_ELEMENT_ID, VIEW_SCHEMA } from "../src/view/model.js";

describe("view model contract", () => {
  it("pins the data element id the template reads", () => {
    expect(DATA_ELEMENT_ID).toBe("codelineage-data");
  });

  it("pins the serialized schema version", () => {
    expect(VIEW_SCHEMA).toBe(1);
  });
});
