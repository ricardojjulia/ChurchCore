import "server-only";

import { TAX_SENTENCE, formatLocalDate, formatMoney, type DonorStatement, type StatementRange } from "./build";
import type { ChurchHeader } from "./load";

// The email body IS the statement (owner decision, G3.3): same content as the
// PDF, HTML and plain text, no attachment. The unsubscribe footer is appended
// by the send path.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function periodLabel(range: StatementRange): string {
  return `${formatLocalDate(range.start)} - ${formatLocalDate(range.end)}`;
}

function headerLines(church: ChurchHeader): string[] {
  return [
    church.name,
    church.legalName && church.legalName !== church.name ? church.legalName : null,
    ...(church.mailingAddress ? church.mailingAddress.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : []),
    [church.contactEmail, church.contactPhone].filter(Boolean).join(" | ") || null,
    church.websiteUrl,
  ].filter((l): l is string => Boolean(l));
}

export function renderStatementEmail(input: {
  church: ChurchHeader;
  statement: DonorStatement;
  range: StatementRange;
}): { subject: string; text: string; html: string } {
  const { church, statement, range } = input;
  const header = headerLines(church);
  const multi = statement.grandTotals.length > 1;
  // One line, whatever the stored church name holds (defence in depth: the
  // providers take the subject as a JSON field, not a raw header).
  const subject = `Your giving statement from ${church.name}`.replace(/[\r\n]+/g, " ");

  const text = [
    ...header,
    "",
    "GIVING STATEMENT",
    `Donor: ${statement.name}`,
    `Period: ${periodLabel(range)}`,
    "",
    "Gifts",
    ...statement.lines.map((l) => `${formatLocalDate(l.date)}  ${l.fund}  ${formatMoney(l.amountCents, l.currency)}`),
    "",
    "Totals by fund",
    ...statement.fundSubtotals.map(
      (s) => `${s.fund} (${s.count} gift${s.count === 1 ? "" : "s"}): ${formatMoney(s.cents, s.currency)}`,
    ),
    ...statement.grandTotals.map((t) => `${multi ? `Total (${t.currency.toUpperCase()})` : "Total"}: ${formatMoney(t.cents, t.currency)}`),
    "",
    TAX_SENTENCE,
  ].join("\n");

  const e = escapeHtml;
  const cell = "padding:4px 8px;border-bottom:1px solid #e5e7eb;";
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">`,
    `<h2 style="margin:0 0 4px;">${e(header[0] ?? church.name)}</h2>`,
    ...header.slice(1).map((l) => `<div style="font-size:13px;color:#4b5563;">${e(l)}</div>`),
    `<h3 style="margin:20px 0 4px;">Giving Statement</h3>`,
    `<div>Donor: ${e(statement.name)}</div>`,
    `<div>Period: ${e(periodLabel(range))}</div>`,
    `<table style="border-collapse:collapse;width:100%;margin-top:16px;font-size:14px;">`,
    `<thead><tr><th align="left" style="${cell}">Date</th><th align="left" style="${cell}">Fund</th><th align="right" style="${cell}">Amount</th></tr></thead>`,
    `<tbody>`,
    ...statement.lines.map(
      (l) =>
        `<tr><td style="${cell}">${e(formatLocalDate(l.date))}</td><td style="${cell}">${e(l.fund)}</td><td align="right" style="${cell}">${e(formatMoney(l.amountCents, l.currency))}</td></tr>`,
    ),
    `</tbody></table>`,
    `<h4 style="margin:20px 0 4px;">Totals by fund</h4>`,
    `<table style="border-collapse:collapse;width:100%;font-size:14px;"><tbody>`,
    ...statement.fundSubtotals.map(
      (s) =>
        `<tr><td style="${cell}">${e(s.fund)} (${s.count} gift${s.count === 1 ? "" : "s"})</td><td align="right" style="${cell}">${e(formatMoney(s.cents, s.currency))}</td></tr>`,
    ),
    ...statement.grandTotals.map(
      (t) =>
        `<tr><td style="${cell}"><strong>${e(multi ? `Total (${t.currency.toUpperCase()})` : "Total")}</strong></td><td align="right" style="${cell}"><strong>${e(formatMoney(t.cents, t.currency))}</strong></td></tr>`,
    ),
    `</tbody></table>`,
    `<p style="margin-top:20px;font-size:13px;">${e(TAX_SENTENCE)}</p>`,
    `</div>`,
  ].join("\n");

  return { subject, text, html };
}
