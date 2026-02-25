function toNumericId(gidOrId) {
  if (!gidOrId) return "";
  return String(gidOrId).split("/").pop();
}

export { toNumericId };
