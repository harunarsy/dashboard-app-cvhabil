export const invoiceFormQuantity = (item) =>
  item?.qty_in_unit ?? item?.quantity ?? "";
