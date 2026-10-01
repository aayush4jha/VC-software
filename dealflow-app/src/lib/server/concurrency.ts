/**
 * Runs `fn` over every item with at most `limit` in flight, keeping the
 * results in the original order.
 *
 * Gmail work is almost all waiting on the network: a hundred messages fetched
 * one after another is a minute, the same hundred ten at a time is seconds.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    }));
    return out;
}
