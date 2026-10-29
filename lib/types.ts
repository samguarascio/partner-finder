// Shapes shared by the API routes and the page. State lives in the browser.

export interface Profile {
  company_name: string;
  domain: string;
  one_liner: string;
  product: string;
  customers: string;
  value_prop: string;
  gaps: string[];
  geography: string;
}

export interface Category {
  name: string;
  rationale: string;
  contact_role: string;
  queries: string[];
}

export interface Email {
  subject: string;
  body: string;
}

export interface Partner {
  id: string;
  name: string;
  category: string;
  fit_score: number; // 1-10
  why: string;
  contact_role: string;
  // Set only when the search result is the company's own site.
  website: string | null;
  // The search result this partner was taken from. Always a real URL.
  source_url: string;
  source_title: string;
  evidence: string;
  email?: Email;
  // Marked "not a fit": hidden, left out of exports, excluded from later searches.
  rejected?: boolean;
}

// Companies a search should skip: already found, or marked not a fit.
export interface Exclusions {
  domains: string[];
  names: string[];
}

export interface ApiError {
  error: string;
}
