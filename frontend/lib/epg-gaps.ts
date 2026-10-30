import type { Program } from "@/lib/channels-data";

type TimeRange = { start: number; end: number };
const HOUR = 3600;

/** Hour-sized empty slots, clipped around real programs and the visible window. */
export function getHourlyEpgGaps(
    programs: Pick<Program, "start" | "end">[],
    start: number,
    end: number,
): TimeRange[] {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

    const gaps: TimeRange[] = [];
    const appendGap = (from: number, to: number) => {
        while (from < to) {
            const next = Math.min(to, (Math.floor(from / HOUR) + 1) * HOUR);
            gaps.push({ start: from, end: next });
            from = next;
        }
    };
    const covered = programs
        .filter((program) => Number.isFinite(program.start) && Number.isFinite(program.end)
            && program.end > program.start && program.end > start && program.start < end)
        .slice()
        .sort((a, b) => a.start - b.start);

    let cursor = start;
    for (const program of covered) {
        appendGap(cursor, Math.min(program.start, end));
        cursor = Math.max(cursor, Math.min(program.end, end));
        if (cursor >= end) break;
    }
    appendGap(cursor, end);
    return gaps;
}
