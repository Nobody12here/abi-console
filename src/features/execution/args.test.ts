import { describe, expect, it } from "vitest";
import type { AbiParameter } from "viem";
import {
  buildArrayElement,
  buildField,
  buildFields,
  collectArgs,
  fieldsFromArgs,
  fieldsToArgsPreview,
} from "./args";

const uintParam: AbiParameter = { name: "amount", type: "uint256" };
const boolParam: AbiParameter = { name: "flag", type: "bool" };
const addressParam: AbiParameter = { name: "account", type: "address" };
const tupleParam: AbiParameter = {
  name: "order",
  type: "tuple",
  components: [
    { name: "maker", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "active", type: "bool" },
  ],
};

describe("buildField", () => {
  it("creates a scalar for a uint", () => {
    expect(buildField(uintParam)).toEqual({ kind: "scalar", value: "" });
  });

  it("creates a bool field", () => {
    expect(buildField(boolParam)).toEqual({ kind: "bool", value: false });
  });

  it("creates a fixed array with the declared length", () => {
    const field = buildField({ type: "uint256[3]" });
    expect(field.kind).toBe("array");
    if (field.kind !== "array") return;
    expect(field.items).toHaveLength(3);
    expect(field.items[0]).toEqual({ kind: "scalar", value: "" });
  });

  it("creates an empty dynamic array", () => {
    const field = buildField({ type: "address[]" });
    expect(field).toEqual({ kind: "array", items: [] });
  });

  it("creates tuple fields in ABI order", () => {
    const field = buildField(tupleParam);
    expect(field.kind).toBe("tuple");
    if (field.kind !== "tuple") return;
    expect(field.fields).toHaveLength(3);
    expect(field.fields[0]).toEqual({ kind: "scalar", value: "" });
    expect(field.fields[2]).toEqual({ kind: "bool", value: false });
  });

  it("creates nested arrays inside tuples", () => {
    const field = buildField({
      type: "tuple",
      components: [{ name: "values", type: "uint8[2][]" }],
    });
    expect(field.kind).toBe("tuple");
    if (field.kind !== "tuple") return;
    expect(field.fields[0].kind).toBe("array");
  });
});

describe("buildArrayElement", () => {
  it("adds one more element for a dynamic nested array", () => {
    const field = buildField({ type: "uint256[][2]" });
    if (field.kind !== "array") throw new Error("expected array");
    const next = buildArrayElement({ type: "uint256[][2]" }, 0);
    expect(next.kind).toBe("array");
  });
});

describe("collectArgs", () => {
  it("converts a uint and checksums an address", () => {
    const fields = buildFields([uintParam, addressParam]);
    if (fields[0].kind !== "scalar" || fields[1].kind !== "scalar") {
      throw new Error("expected scalars");
    }
    fields[0].value = "42";
    fields[1].value = "0x000000000000000000000000000000000000dead";

    const { args, errors } = collectArgs([uintParam, addressParam], fields);
    expect(errors).toEqual({});
    expect(args[0]).toBe(42n);
    expect(args[1]).toBe("0x000000000000000000000000000000000000dEaD");
  });

  it("reports an invalid address without throwing", () => {
    const fields = buildFields([addressParam]);
    if (fields[0].kind !== "scalar") throw new Error("expected scalar");
    fields[0].value = "0x123";

    const { args, errors } = collectArgs([addressParam], fields);
    expect(args[0]).toBeUndefined();
    expect(errors["0"]).toMatch(/valid address/i);
  });

  it("enforces uint8 bounds", () => {
    const fields = buildFields([{ type: "uint8" }]);
    if (fields[0].kind !== "scalar") throw new Error("expected scalar");
    fields[0].value = "256";

    const { errors } = collectArgs([{ type: "uint8" }], fields);
    expect(errors["0"]).toMatch(/uint8/);
  });

  it("distinguishes signed bounds", () => {
    const signed = buildFields([{ type: "int8" }]);
    if (signed[0].kind !== "scalar") throw new Error("expected scalar");
    signed[0].value = "-128";
    expect(collectArgs([{ type: "int8" }], signed).errors).toEqual({});

    signed[0].value = "-129";
    expect(collectArgs([{ type: "int8" }], signed).errors["0"]).toMatch(/int8/);
  });

  it("converts nested tuple fields in order", () => {
    const fields = buildFields([tupleParam]);
    if (fields[0].kind !== "tuple") throw new Error("expected tuple");
    const [maker, amount, active] = fields[0].fields;
    if (
      maker.kind !== "scalar" ||
      amount.kind !== "scalar" ||
      active.kind !== "bool"
    ) {
      throw new Error("unexpected field kinds");
    }
    maker.value = "0x000000000000000000000000000000000000dead";
    amount.value = "7";
    active.value = true;

    const { args, errors } = collectArgs([tupleParam], fields);
    expect(errors).toEqual({});
    expect(args).toEqual([
      ["0x000000000000000000000000000000000000dEaD", 7n, true],
    ]);
  });

  it("validates fixed array length", () => {
    const param: AbiParameter = { type: "uint256[2]" };
    const fields = buildFields([param]);
    if (fields[0].kind !== "array") throw new Error("expected array");
    const shortened = { ...fields[0], items: fields[0].items.slice(1) };

    const { errors } = collectArgs([param], [shortened]);
    expect(errors["0"]).toMatch(/exactly 2/);
  });

  it("accepts an empty dynamic array", () => {
    const param: AbiParameter = { type: "address[]" };
    const { args, errors } = collectArgs([param], buildFields([param]));
    expect(errors).toEqual({});
    expect(args).toEqual([[]]);
  });

  it("validates boolean fields", () => {
    const fields = buildFields([boolParam]);
    const { args, errors } = collectArgs([boolParam], fields);
    expect(errors).toEqual({});
    expect(args).toEqual([false]);
  });

  it("validates bytes and bytesN", () => {
    const dynamic = buildFields([{ type: "bytes" }]);
    const fixed = buildFields([{ type: "bytes4" }]);
    if (dynamic[0].kind !== "scalar" || fixed[0].kind !== "scalar") {
      throw new Error("expected scalars");
    }

    dynamic[0].value = "0x123456";
    fixed[0].value = "0x12345678";
    expect(collectArgs([{ type: "bytes" }, { type: "bytes4" }], [dynamic[0], fixed[0]]).errors).toEqual({});

    fixed[0].value = "0x12";
    expect(
      collectArgs([{ type: "bytes4" }], [fixed[0]]).errors["0"],
    ).toMatch(/exactly 4 bytes/);
  });
});

describe("fieldsFromArgs", () => {
  it("hydrates fields from ordered arguments", () => {
    const fields = fieldsFromArgs(
      [uintParam, boolParam, addressParam],
      ["12", true, "0x000000000000000000000000000000000000dead"],
    );

    expect(fields[0]).toEqual({ kind: "scalar", value: "12" });
    expect(fields[1]).toEqual({ kind: "bool", value: true });
    expect(fields[2]).toEqual({
      kind: "scalar",
      value: "0x000000000000000000000000000000000000dead",
    });
  });

  it("hydrates tuple fields from an object", () => {
    const fields = fieldsFromArgs(
      [tupleParam],
      [
        {
          maker: "0x000000000000000000000000000000000000dead",
          amount: "9",
          active: true,
        },
      ],
    );

    expect(fields[0].kind).toBe("tuple");
    if (fields[0].kind !== "tuple") return;
    expect(fields[0].fields[1]).toEqual({ kind: "scalar", value: "9" });
    expect(fields[0].fields[2]).toEqual({ kind: "bool", value: true });
  });

  it("rejects the wrong argument count", () => {
    expect(() => fieldsFromArgs([uintParam], [])).toThrow(/Expected 1 argument/);
  });

  it("rejects non-array input", () => {
    expect(() => fieldsFromArgs([uintParam], { 0: "1" })).toThrow(/JSON array/);
  });

  it("rejects the wrong fixed array length", () => {
    expect(() => fieldsFromArgs([{ type: "uint256[2]" }], [[1]])).toThrow(
      /Expected 2 elements/,
    );
  });
});

describe("fieldsToArgsPreview", () => {
  it("serializes bigint arguments as strings", () => {
    expect(JSON.parse(fieldsToArgsPreview([1n, "ok"]))).toEqual(["1", "ok"]);
  });
});
