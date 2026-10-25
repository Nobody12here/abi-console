import type { AbiParameter } from "viem";
import { Minus, Plus } from "lucide-react";
import {
  buildArrayElement,
  type ArgErrors,
  type FieldState,
} from "@/features/execution/args";
import { splitArrayType } from "@/features/abi/normalize";
import {
  formatInputLabel,
  parameterComponents,
} from "@/features/abi/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type Props = {
  parameter: AbiParameter;
  field: FieldState;
  onChange: (next: FieldState) => void;
  path: string;
  label: string;
  depth?: number;
  errors: ArgErrors;
  disabled?: boolean;
  topLevel?: boolean;
};

function placeholderFor(type: string): string {
  if (type === "address") return "0x…";
  if (type === "bool") return "";
  if (type === "string") return "text";
  if (type === "bytes" || type.startsWith("bytes")) return "0x…";
  if (type.includes("int")) return "0";
  if (type === "function") return "0x… (24 bytes)";
  return "";
}

function FieldEditor({
  parameter,
  field,
  onChange,
  path,
  label,
  depth = 0,
  errors,
  disabled,
  topLevel = false,
}: Props) {
  const { base, dimensions } = splitArrayType(parameter.type);
  const typeLabel = parameter.type;
  const error = errors[path];

  if (depth < dimensions.length) {
    if (field.kind !== "array") return null;
    const dynamic = dimensions[depth] === null;
    const size = dimensions[depth];

    return (
      <div className={cn("arg-group", topLevel && "top-level")}>
        <div className="arg-group-heading">
          <span className="arg-label">
            {label}
            <em className="mono">{typeLabel}</em>
          </span>
          {dynamic && (
            <span className="arg-count">
              {field.items.length} {field.items.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        <div className="array-items">
          {field.items.map((item, index) => (
            <div className="array-item" key={`${path}[${index}]`}>
              <span className="array-index mono">[{index}]</span>
              <div className="array-item-body">
                <FieldEditor
                  parameter={parameter}
                  field={item}
                  onChange={(next) =>
                    onChange({
                      ...field,
                      items: field.items.map((entry, entryIndex) =>
                        entryIndex === index ? next : entry,
                      ),
                    })
                  }
                  path={`${path}[${index}]`}
                  label=""
                  depth={depth + 1}
                  errors={errors}
                  disabled={disabled}
                />
              </div>
              {dynamic && (
                <button
                  type="button"
                  className="icon-btn small"
                  aria-label={`Remove item ${index}`}
                  onClick={() =>
                    onChange({
                      ...field,
                      items: field.items.filter(
                        (_entry, entryIndex) => entryIndex !== index,
                      ),
                    })
                  }
                  disabled={disabled}
                >
                  <Minus size={13} />
                </button>
              )}
            </div>
          ))}
          {field.items.length === 0 && (
            <p className="array-empty">Empty array — that is valid for a dynamic type.</p>
          )}
        </div>

        {dynamic && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={13} />}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...field,
                items: [
                  ...field.items,
                  buildArrayElement(parameter, depth),
                ],
              })
            }
          >
            Add {size === null ? "item" : "item"}
          </Button>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }

  if (base === "tuple") {
    if (field.kind !== "tuple") return null;
    const components = parameterComponents(parameter);

    return (
      <div className={cn("arg-group tuple-group", topLevel && "top-level")}>
        <div className="arg-group-heading">
          <span className="arg-label">
            {label}
            <em className="mono">{typeLabel}</em>
          </span>
          <span className="arg-count">tuple</span>
        </div>
        <div className="tuple-fields">
          {components.map((component, index) => {
            const componentLabel =
              component.name || `field${index}`;
            return (
              <FieldEditor
                key={`${path}.${componentLabel}`}
                parameter={component}
                field={field.fields[index] ?? { kind: "scalar", value: "" }}
                onChange={(next) =>
                  onChange({
                    ...field,
                    fields: components.map((_component, componentIndex) =>
                      componentIndex === index
                        ? next
                        : field.fields[componentIndex],
                    ),
                  })
                }
                path={`${path}.${component.name || index}`}
                label={componentLabel}
                depth={0}
                errors={errors}
                disabled={disabled}
              />
            );
          })}
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }

  if (base === "bool") {
    if (field.kind !== "bool") return null;
    return (
      <div className={cn("arg-field", topLevel && "top-level")}>
        <span className="arg-label">
          {label}
          <em className="mono">{typeLabel}</em>
        </span>
        <div className="bool-toggle" role="group" aria-label={label || "bool value"}>
          <button
            type="button"
            className={field.value ? "selected" : ""}
            aria-pressed={field.value}
            disabled={disabled}
            onClick={() => onChange({ ...field, value: true })}
          >
            true
          </button>
          <button
            type="button"
            className={!field.value ? "selected" : ""}
            aria-pressed={!field.value}
            disabled={disabled}
            onClick={() => onChange({ ...field, value: false })}
          >
            false
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }

  if (field.kind !== "scalar") return null;

  return (
    <div className={cn("arg-field", topLevel && "top-level")}>
      <label className="arg-label" htmlFor={`arg-${path}`}>
        {label}
        <em className="mono">{typeLabel}</em>
      </label>
      <input
        id={`arg-${path}`}
        className={cn("field mono", error && "invalid")}
        value={field.value}
        onChange={(event) =>
          onChange({ ...field, value: event.target.value })
        }
        placeholder={placeholderFor(base)}
        spellCheck={false}
        disabled={disabled}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function ArgsForm({
  inputs,
  fields,
  onChange,
  errors,
  disabled,
}: {
  inputs: readonly AbiParameter[];
  fields: FieldState[];
  onChange: (index: number, next: FieldState) => void;
  errors: ArgErrors;
  disabled?: boolean;
}) {
  if (inputs.length === 0) {
    return (
      <p className="no-args">
        This method takes no arguments.
      </p>
    );
  }

  return (
    <div className="args-form">
      {inputs.map((input, index) => (
        <FieldEditor
          key={index}
          parameter={input}
          field={fields[index]}
          onChange={(next) => onChange(index, next)}
          path={String(index)}
          label={formatInputLabel(input, index)}
          errors={errors}
          disabled={disabled}
          topLevel
        />
      ))}
    </div>
  );
}
