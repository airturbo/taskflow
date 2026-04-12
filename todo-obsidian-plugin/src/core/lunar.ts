/**
 * Simplified Solar-to-Lunar calendar conversion (1900-2100).
 * Uses a lookup table approach for lunar calendar data.
 */

/* ─── Lunar data table ────────────────────────────────────────────
 * Each entry encodes one lunar year:
 *  - Bits 19-16: leap month (0 = no leap)
 *  - Bits 15-4:  12 months, 1 = 30 days, 0 = 29 days (month 1 at bit 15)
 *  - Bits 3-0:   leap month days (1 = 30, 0 = 29) — only bit 0 used
 * ─────────────────────────────────────────────────────────────── */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  0x0d520,
];

const LUNAR_MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];

const LUNAR_DAY_NAMES = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/* ─── Solar terms (节气) ─────────────────────────────────────────
 * Approximate via a simplified formula.
 * ─────────────────────────────────────────────────────────────── */
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

// Approximate solar term offsets for each term (century table for 2000s)
const TERM_BASE = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646,
  4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042,
  8.318, 23.438, 7.438, 22.36, 7.18, 21.94,
];

function getSolarTermDate(year: number, termIndex: number): number {
  const base = TERM_BASE[termIndex];
  // Century-specific adjustment
  const y = year % 100;
  const d = Math.floor(y * 0.2422 + base) - Math.floor((y - 1) / 4);
  // Some known corrections
  if (termIndex === 0 && year === 2019) return 5;
  if (termIndex === 2 && year === 2026) return 4;
  return d > 0 ? d : Math.floor(base);
}

function getSolarTerm(year: number, month: number, day: number): string | undefined {
  // Each month has exactly 2 solar terms
  const termIndex1 = (month - 1) * 2;
  const termIndex2 = termIndex1 + 1;

  if (termIndex1 >= 0 && termIndex1 < 24) {
    const d1 = getSolarTermDate(year, termIndex1);
    if (d1 === day) return SOLAR_TERMS[termIndex1];
  }
  if (termIndex2 >= 0 && termIndex2 < 24) {
    const d2 = getSolarTermDate(year, termIndex2);
    if (d2 === day) return SOLAR_TERMS[termIndex2];
  }
  return undefined;
}

/* ─── Lunar year helpers ──────────────────────────────────────── */

/** Get the leap month for a lunar year (0 = no leap). */
function leapMonth(year: number): number {
  return LUNAR_INFO[year - 1900] & 0xf;
}

/** Get the number of days in the leap month (0 if no leap). */
function leapDays(year: number): number {
  if (leapMonth(year) === 0) return 0;
  return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
}

/** Get the total number of days in a lunar year. */
function lunarYearDays(year: number): number {
  let sum = 348; // 12 months * 29 days base
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    if (LUNAR_INFO[year - 1900] & i) sum++;
  }
  return sum + leapDays(year);
}

/** Get days in a specific lunar month (1-indexed, non-leap). */
function lunarMonthDays(year: number, month: number): number {
  const bit = 0x10000 >> month;
  return (LUNAR_INFO[year - 1900] & bit) ? 30 : 29;
}

/* ─── Main conversion ──────────────────────────────────────────── */

export interface LunarDate {
  lunarMonth: string;
  lunarDay: string;
  term?: string;
  isLeapMonth: boolean;
  isFirstDay: boolean;
}

const LUNAR_BASE = new Date(1900, 0, 31); // Jan 31, 1900 = Lunar 正月初一

export function getLunarDate(year: number, month: number, day: number): LunarDate {
  if (year < 1900 || year > 2100) {
    return { lunarMonth: '', lunarDay: '', isLeapMonth: false, isFirstDay: false };
  }

  const targetDate = new Date(year, month - 1, day);
  let offset = Math.round((targetDate.getTime() - LUNAR_BASE.getTime()) / 86400000);

  // Find lunar year
  let lunarYear = 1900;
  let daysInYear: number;
  for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
    daysInYear = lunarYearDays(lunarYear);
    offset -= daysInYear;
  }
  if (offset < 0) {
    offset += lunarYearDays(--lunarYear);
  }

  // Find lunar month
  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  let daysInMonth: number;

  for (let i = 1; i <= 13 && offset >= 0; i++) {
    if (i === leap + 1 && !isLeap) {
      // This is the leap month
      daysInMonth = leapDays(lunarYear);
      isLeap = true;
      i--; // Don't advance month number for leap
    } else {
      daysInMonth = lunarMonthDays(lunarYear, lunarMonth);
    }

    if (isLeap && i === leap + 1) {
      isLeap = false;
    }

    offset -= daysInMonth;
    if (!isLeap) lunarMonth++;
  }

  // Correct for overshoot
  if (offset < 0) {
    offset += daysInMonth!;
    lunarMonth--;
  }

  // Re-check leap status
  isLeap = (lunarMonth === leap);

  const lunarDay = offset + 1;
  const isFirstDay = lunarDay === 1;

  // Get solar term
  const term = getSolarTerm(year, month, day);

  const monthIdx = Math.max(0, Math.min(lunarMonth - 1, 11));
  const monthName = (isLeap ? '闰' : '') + LUNAR_MONTH_NAMES[monthIdx];

  return {
    lunarMonth: monthName,
    lunarDay: LUNAR_DAY_NAMES[lunarDay] || `${lunarDay}`,
    term,
    isLeapMonth: isLeap,
    isFirstDay,
  };
}

/**
 * Get display text for a lunar date in calendar cell.
 * Priority: solar term > first day of month (show month name) > day name
 */
export function getLunarDisplayText(year: number, month: number, day: number): {
  text: string;
  isTerm: boolean;
  isFirstDay: boolean;
} {
  const lunar = getLunarDate(year, month, day);

  if (lunar.term) {
    return { text: lunar.term, isTerm: true, isFirstDay: false };
  }

  if (lunar.isFirstDay) {
    return { text: lunar.lunarMonth, isTerm: false, isFirstDay: true };
  }

  return { text: lunar.lunarDay, isTerm: false, isFirstDay: false };
}
