// Which page a company belongs on. Pure, no imports, so the server routes and
// the app context share one rule.

/**
 * Whether a company sits on the Fund House page rather than in Deal Flow's
 * lists. A fund moved to Portfolio leaves Fund House and joins the Portfolio,
 * as a deal does.
 */
export function isOnFundHouse(board: string | null | undefined, terminalStatus: string | null | undefined): boolean {
    return board === 'fund_house' && terminalStatus !== 'Portfolio';
}
