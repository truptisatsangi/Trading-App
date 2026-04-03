export function toSerializable(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  // ethers v6 Result: named tuple fields are on toObject(), not always on Object.entries()
  if (value && typeof value === "object" && typeof value.toObject === "function") {
    return toSerializable(value.toObject());
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
