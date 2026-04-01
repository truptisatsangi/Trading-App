export function toSerializable(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = toSerializable(item);
    }
    return out;
  }

  return value;
}
