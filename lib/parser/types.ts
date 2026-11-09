export interface TextItem {
  str: string;
  x: number;
  y: number;
}

export const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "4 Bedroom"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export interface ParsedListing {
  inventoryNumber: string;
  arrivalDate: string; // YYYY-MM-DD
  checkoutDate: string; // arrival + 7 days
  property: string;
  city: string;
  state: string;
  countryCode: string;
  country: string;
  unitType: UnitType;
  priceUsd: number;
}

export interface ParseWarning {
  page: number;
  row: number; // 1-based data row index within the page
  inventoryNumber?: string;
  message: string;
}

export interface ParseResult {
  listings: ParsedListing[];
  warnings: ParseWarning[];
}
