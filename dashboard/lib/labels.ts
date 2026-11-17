export const CONCLUSION_LABELS: Record<string, string> = {
  lead_submitted: "Lead sent to sales",
  product_recommended: "Product recommended",
  referred_to_specialist: "Referred to specialist",
  found_dealer_or_rep: "Found a dealer or rep",
  quantity_estimate: "Got a quantity estimate",
  question_answered: "Question answered",
  unresolved: "Unresolved",
  abandoned: "Left early",
  off_topic: "Off topic",
};

export const TOPIC_LABELS: Record<string, string> = {
  product_selection: "Choosing a product",
  specs: "Specs",
  installation: "Installation",
  quantities: "Quantities",
  pricing_quote: "Pricing / quote",
  where_to_buy: "Where to buy",
  samples: "Samples",
  company_info: "Company info",
  other: "Other",
};

export const CUSTOMER_LABELS: Record<string, string> = {
  contractor: "Contractor",
  landscape_architect: "Landscape architect",
  distributor: "Distributor",
  homeowner: "Homeowner",
  other: "Other",
  unknown: "Unknown",
};

export const REQUEST_LABELS: Record<string, string> = {
  quote: "Quote",
  samples: "Samples",
  rep_contact: "Rep contact",
  spec_help: "Spec help",
  dealer_inquiry: "Dealer inquiry",
  other: "Other",
};

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
  QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
};

let names: Intl.DisplayNames | null = null;
export function countryName(code: string | null) {
  if (!code) return "Unknown";
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function regionName(country: string | null, region: string | null) {
  if (!region) return "Unknown";
  if (country === "US") return US_STATES[region] ?? region;
  if (country === "CA") return CA_PROVINCES[region] ?? region;
  return region;
}

export const label = (map: Record<string, string>, v: string | null) => (v ? (map[v] ?? v.replace(/_/g, " ")) : "Not classified");
