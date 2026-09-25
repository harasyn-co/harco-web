export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
