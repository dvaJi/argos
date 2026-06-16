import type { FC } from "react";
import { JsonObject } from "./JsonObject";
import { JsonArray } from "./JsonArray";

const isObject = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === "object" && !Array.isArray(val);

const isArray = (val: unknown): val is unknown[] => Array.isArray(val);

const isPrimitive = (val: unknown): val is string | number | boolean | null =>
  val === null || ["string", "number", "boolean"].includes(typeof val);

const getTypeClass = (val: unknown): string => {
  if (val === null) return "text-gray-500 leading-6";
  if (typeof val === "string") return "text-green-600 dark:text-green-400 leading-6";
  if (typeof val === "number") return "text-blue-600 dark:text-blue-400 leading-6";
  if (typeof val === "boolean") return "text-purple-600 dark:text-purple-400 leading-6";
  return "";
};

interface JsonValueProps {
  value: unknown;
}

export const JsonValue: FC<JsonValueProps> = ({ value }) => {
  if (isPrimitive(value)) {
    if (value === null) {
      return <span className={getTypeClass(value)}>null</span>;
    }
    if (typeof value === "string") {
      return <span className={getTypeClass(value)}>{value}</span>;
    }
    return <span className={getTypeClass(value)}>{String(value)}</span>;
  }

  if (isObject(value)) {
    return <JsonObject data={value} isNested />;
  }

  if (isArray(value)) {
    return <JsonArray data={value} />;
  }

  return <span>{String(value)}</span>;
};
