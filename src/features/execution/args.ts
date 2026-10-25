import { getAddress } from "viem";
import type { AbiParameter } from "viem";
import { splitArrayType } from "@/features/abi/normalize";
import { parameterComponents } from "@/features/abi/utils";

export type ScalarField = { kind: "scalar"; value: string };
export type BoolField = { kind: "bool"; value: boolean };
export type ArrayField = { kind: "array"; items: FieldState[] };
export type TupleField = { kind: "tuple"; fields: FieldState[] };

export type FieldState = ScalarField | BoolField | ArrayField | TupleField;

export type ArgErrors = Record<string, string>;

export type CollectedArgs = {
  args: unknown[];
  errors: ArgErrors;
};

function buildAt(
  parameter: AbiParameter,
  dimensions: Array<number | null>,
  index: number,
): FieldState {
  if (index < dimensions.length) {
    const size = dimensions[index];
    const items =
      size === null
        ? []
        : Array.from({ length: size }, () =>
            buildAt(parameter, dimensions, index + 1),
          );
    return { kind: "array", items };
  }

  const { base } = splitArrayType(parameter.type);
  if (base === "tuple") {
    return {
      kind: "tuple",
      fields: parameterComponents(parameter).map((component) =>
        buildField(component),
      ),
    };
  }
  if (base === "bool") {
    return { kind: "bool", value: false };
  }
  return { kind: "scalar", value: "" };
}

export function buildField(parameter: AbiParameter): FieldState {
  const { dimensions } = splitArrayType(parameter.type);
  return buildAt(parameter, dimensions, 0);
}

export function buildFields(inputs: readonly AbiParameter[]): FieldState[] {
  return inputs.map((input) => buildField(input));
}

/** Create one element for an array rendered at `arrayDepth`. */
export function buildArrayElement(
  parameter: AbiParameter,
  arrayDepth: number,
): FieldState {
  const { dimensions } = splitArrayType(parameter.type);
  return buildAt(parameter, dimensions, arrayDepth + 1);
}

function scalar(
  base: string,
  raw: string,
  path: string,
  errors: ArgErrors,
): unknown {
  const value = raw.trim();

  if (base === "address") {
    try {
      return getAddress(value);
    } catch {
      errors[path] = "Enter a valid address.";
      return undefined;
    }
  }

  const intMatch = /^(u?)int(\d*)$/.exec(base);
  if (intMatch) {
    if (!value) {
      errors[path] = "Enter an integer.";
      return undefined;
    }
    let parsed: bigint;
    try {
      parsed = BigInt(value);
    } catch {
      errors[path] = "Enter a decimal or 0x-prefixed integer.";
      return undefined;
    }
    const signed = intMatch[1] !== "u";
    const bits = intMatch[2] ? Number(intMatch[2]) : 256;
    const bound = 1n << BigInt(bits);
    if (signed) {
      const min = -(1n << BigInt(bits - 1));
      const max = (1n << BigInt(bits - 1)) - 1n;
      if (parsed < min || parsed > max) {
        errors[path] = `Out of range for int${bits}.`;
        return undefined;
      }
    } else if (parsed < 0n || parsed >= bound) {
      errors[path] = `Out of range for uint${bits}.`;
      return undefined;
    }
    return parsed;
  }

  if (base === "bool") {
    errors[path] = "Choose true or false.";
    return undefined;
  }

  if (base === "string") {
    return raw;
  }

  if (base === "bytes") {
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
      errors[path] = "Enter 0x-prefixed hex with an even number of digits.";
      return undefined;
    }
    return value;
  }

  const bytesMatch = /^bytes(\d+)$/.exec(base);
  if (bytesMatch) {
    const size = Number(bytesMatch[1]);
    if (!new RegExp(`^0x[0-9a-fA-F]{${size * 2}}$`).test(value)) {
      errors[path] = `Enter exactly ${size} bytes of hex.`;
      return undefined;
    }
    return value;
  }

  if (base === "function") {
    if (!/^0x[0-9a-fA-F]{48}$/.test(value)) {
      errors[path] = "Enter a 24-byte function value.";
      return undefined;
    }
    return value;
  }

  errors[path] = `Unsupported type ${base}.`;
  return undefined;
}

function convertAt(
  field: FieldState,
  parameter: AbiParameter,
  dimensions: Array<number | null>,
  index: number,
  path: string,
  errors: ArgErrors,
): unknown {
  if (index < dimensions.length) {
    if (field.kind !== "array") {
      errors[path] = "Expected an array.";
      return undefined;
    }
    const fixedSize = dimensions[index];
    if (fixedSize !== null && field.items.length !== fixedSize) {
      errors[path] = `Expected exactly ${fixedSize} elements.`;
      return undefined;
    }
    return field.items.map((item, itemIndex) =>
      convertAt(
        item,
        parameter,
        dimensions,
        index + 1,
        `${path}[${itemIndex}]`,
        errors,
      ),
    );
  }

  const { base } = splitArrayType(parameter.type);

  if (base === "tuple") {
    if (field.kind !== "tuple") {
      errors[path] = "Expected tuple fields.";
      return undefined;
    }
    const components = parameterComponents(parameter);
    if (field.fields.length !== components.length) {
      errors[path] = "Tuple fields do not match the ABI.";
      return undefined;
    }
    return components.map((component, componentIndex) =>
      convertAt(
        field.fields[componentIndex],
        component,
        splitArrayType(component.type).dimensions,
        0,
        `${path}.${component.name || componentIndex}`,
        errors,
      ),
    );
  }

  if (base === "bool") {
    if (field.kind !== "bool") {
      errors[path] = "Choose true or false.";
      return undefined;
    }
    return field.value;
  }

  if (field.kind !== "scalar") {
    errors[path] = "Expected a value.";
    return undefined;
  }
  return scalar(base, field.value, path, errors);
}

export function collectArgs(
  inputs: readonly AbiParameter[],
  fields: FieldState[],
): CollectedArgs {
  const errors: ArgErrors = {};
  const args = inputs.map((input, index) => {
    const field = fields[index];
    if (!field) {
      errors[String(index)] = "Missing input value.";
      return undefined;
    }
    return convertAt(
      field,
      input,
      splitArrayType(input.type).dimensions,
      0,
      String(index),
      errors,
    );
  });
  return { args, errors };
}

function valueToField(parameter: AbiParameter, value: unknown): FieldState {
  return valueToFieldAt(parameter, value, 0);
}

function valueToFieldAt(
  parameter: AbiParameter,
  value: unknown,
  depth: number,
): FieldState {
  const { base, dimensions } = splitArrayType(parameter.type);

  if (depth < dimensions.length) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected an array for ${parameter.type}.`);
    }
    const size = dimensions[depth];
    if (size !== null && value.length !== size) {
      throw new Error(`Expected ${size} elements for ${parameter.type}.`);
    }
    return {
      kind: "array",
      items: value.map((entry) =>
        valueToFieldAt(parameter, entry, depth + 1),
      ),
    };
  }

  if (base === "tuple") {
    const components = parameterComponents(parameter);
    if (Array.isArray(value)) {
      return {
        kind: "tuple",
        fields: components.map((component, index) =>
          valueToField(component, value[index]),
        ),
      };
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return {
        kind: "tuple",
        fields: components.map((component, index) =>
          valueToField(
            component,
            component.name ? record[component.name] : record[index],
          ),
        ),
      };
    }
    throw new Error(`Expected an object for tuple ${parameter.type}.`);
  }

  if (base === "bool") {
    return { kind: "bool", value: value === true || value === "true" };
  }

  if (value === null || value === undefined) {
    return { kind: "scalar", value: "" };
  }
  return { kind: "scalar", value: String(value) };
}

export function fieldsFromArgs(
  inputs: readonly AbiParameter[],
  value: unknown,
): FieldState[] {
  if (!Array.isArray(value)) {
    throw new Error("The pasted value must be a JSON array of arguments.");
  }
  if (value.length !== inputs.length) {
    throw new Error(
      `Expected ${inputs.length} arguments, received ${value.length}.`,
    );
  }
  return inputs.map((input, index) => valueToField(input, value[index]));
}

export function fieldsToArgsPreview(
  args: unknown[],
): string {
  return JSON.stringify(
    args,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}
