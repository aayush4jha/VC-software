// Indian states and Union Territories.
//
// Lived as a private copy in PortfolioCompanyForm and again in
// PortfolioCompanyDetail, so a correction to one list silently left the other
// wrong. Every screen that asks for a state reads this one.
export const INDIAN_STATES_AND_UTS: string[] = [
    // States
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    // Union Territories
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// A state recorded before the dropdown existed — or an overseas HQ typed as
// free text — must still show as the current value rather than reading blank,
// so it is offered alongside the canonical list.
export function stateOptions(current: string | null | undefined): string[] {
    if (current && !INDIAN_STATES_AND_UTS.includes(current)) {
        return [current, ...INDIAN_STATES_AND_UTS];
    }
    return INDIAN_STATES_AND_UTS;
}

// "City, State" for display; either half may be missing.
export function formatLocation(city: string | null | undefined, state: string | null | undefined): string {
    return [city, state].filter(Boolean).join(', ');
}
