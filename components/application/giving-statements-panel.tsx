"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Table, Text, TextInput } from "@mantine/core";
import { Download, Mail } from "lucide-react";

import {
  previewStatementsAction,
  sendStatementsAction,
  type StatementPreview,
  type StatementPreviewRow,
} from "@/app/app/church-admin/giving/statements-actions";

// Year-end giving statements for church admins (G3.3): preview who gets a
// statement for a range, download any donor's PDF, and email the batch. Donor
// emails never reach this component. Staff see each donor's NAMED gifts only;
// anonymous gifts arrive as one unattributed aggregate line, and donors who
// gave only anonymously have no row (owner decision 2026-10-04).

type SendSummary = Extract<Awaited<ReturnType<typeof sendStatementsAction>>, { ok: true }>["summary"];

const REASON_LABEL: Record<NonNullable<StatementPreviewRow["reason"]>, string> = {
  no_email: "No email on file",
  opted_out: "Opted out of email",
  suppressed: "Email suppressed",
};

function formatMoney(cents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatTotals(preview: StatementPreview): string {
  if (preview.totalsByCurrency.length > 1) {
    return preview.totalsByCurrency.map((t) => formatMoney(t.cents, t.currency)).join(" + ");
  }
  const only = preview.totalsByCurrency[0];
  return formatMoney(preview.totalCents, only?.currency ?? "usd");
}

function formatAnonymousTotals(anonymous: StatementPreview["anonymous"]): string {
  if (anonymous.totalsByCurrency.length > 1) {
    return anonymous.totalsByCurrency.map((t) => formatMoney(t.cents, t.currency)).join(" + ");
  }
  return formatMoney(anonymous.totalCents, anonymous.totalsByCurrency[0]?.currency ?? "usd");
}

function rowTotal(row: StatementPreviewRow): string {
  if (row.grandTotals.length > 1) return row.grandTotals.map((t) => formatMoney(t.cents, t.currency)).join(" + ");
  return formatMoney(row.totalCents, row.grandTotals[0]?.currency ?? "usd");
}

function pdfHref(donorRef: string, range: { start: string; end: string }): string {
  const params = new URLSearchParams({ donor: donorRef, start: range.start, end: range.end });
  return `/api/giving/statements/pdf?${params.toString()}`;
}

export function GivingStatementsPanel() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<{ range: { start: string; end: string }; summary: SendSummary } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSending, startSend] = useTransition();

  function runPreview() {
    setError(null);
    setSummary(null);
    setSendError(null);
    startPreview(async () => {
      const result = await previewStatementsAction({ start: start || undefined, end: end || undefined }).catch(
        () => ({ ok: false as const, error: "Could not build the statement preview. Try again." }),
      );
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setPreview(result.preview);
      setStart(result.preview.range.start);
      setEnd(result.preview.range.end);
    });
  }

  function runSend() {
    if (!preview || isSending) return;
    const range = preview.range;
    setSendError(null);
    startSend(async () => {
      const result = await sendStatementsAction({ start: range.start, end: range.end, confirm: true }).catch(
        () => ({ ok: false as const, error: "Could not send statements. Try again." }),
      );
      setConfirmOpen(false);
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      setSummary({ range: result.range, summary: result.summary });
    });
  }

  const empty = preview !== null && preview.donorCount === 0;
  const canSend = preview !== null && !empty && preview.emailCount > 0;

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Giving statements</Text>
          <Text fz="sm" c="dimmed">
            Leave the dates blank for last calendar year. Only completed gifts count. Previewing sends nothing.
          </Text>
          <Group align="flex-end" gap="sm">
            <TextInput
              type="date"
              label="Start date"
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
              style={{ flex: "1 1 160px" }}
            />
            <TextInput
              type="date"
              label="End date"
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
              style={{ flex: "1 1 160px" }}
            />
            <Button onClick={runPreview} loading={isPreviewing} disabled={isSending}>
              Preview
            </Button>
          </Group>
        </Stack>
      </Paper>

      {error ? (
        <Alert color="red" variant="light" role="alert" title="Can't build statements">
          {error}
        </Alert>
      ) : null}

      {preview ? (
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" gap="md">
              <Stack gap={2}>
                <Text fz="xs" c="dimmed">
                  {preview.range.start} to {preview.range.end}
                </Text>
                <Text fw={600}>
                  {preview.donorCount} {preview.donorCount === 1 ? "donor" : "donors"}
                </Text>
                <Text fz="sm">
                  Named gifts total {formatTotals(preview)}
                  {preview.anonymous.giftCount > 0
                    ? `; anonymous gifts ${formatAnonymousTotals(preview.anonymous)} (${preview.anonymous.giftCount})`
                    : ""}
                </Text>
                <Text fz="sm" c="dimmed">
                  {preview.emailCount} will be emailed · {preview.skipCount} skipped
                </Text>
                {preview.anonymous.onlyDonors > 0 ? (
                  <Text fz="xs" c="dimmed">
                    {preview.anonymous.onlyDonors} {preview.anonymous.onlyDonors === 1 ? "donor" : "donors"} of anonymous-only gifts:{" "}
                    {preview.anonymous.onlyWillEmail} will be emailed, {preview.anonymous.onlySkipped} skipped
                  </Text>
                ) : null}
              </Stack>
              <Button
                leftSection={<Mail size={14} />}
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend || isSending}
                loading={isSending}
              >
                Send statements
              </Button>
            </Group>

            {empty ? (
              <Text fz="sm" c="dimmed" ta="center" py="md">
                No statements for this range
              </Text>
            ) : preview.rows.length === 0 ? null : (
              <div style={{ overflowX: "auto" }}>
                <Table striped highlightOnHover aria-label="Statement recipients">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Donor</Table.Th>
                      <Table.Th>Gifts</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>PDF</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.rows.map((row) => (
                      <Table.Tr key={row.donorRef}>
                        <Table.Td>{row.name}</Table.Td>
                        <Table.Td>{row.giftCount}</Table.Td>
                        <Table.Td>{rowTotal(row)}</Table.Td>
                        <Table.Td>
                          {row.willEmail ? (
                            <Badge color="teal" variant="light">
                              Will email
                            </Badge>
                          ) : (
                            <Text fz="sm">
                              {row.reason ? REASON_LABEL[row.reason] : "Skipped"}
                              {row.reasonDetail ? ` (${row.reasonDetail})` : ""}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            component="a"
                            href={pdfHref(row.donorRef, preview.range)}
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<Download size={13} />}
                            aria-label={`Download PDF for ${row.name}`}
                          >
                            Download PDF
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}

            {preview.unstatementable.length > 0 ? (
              <Stack gap="xs">
                <Text fw={600} fz="sm">
                  Un-statementable gifts
                </Text>
                <Text fz="xs" c="dimmed">
                  These gifts have no donor profile or email, so they get no statement and are not included in the statement totals above. They remain in your giving records and reports.
                </Text>
                <div style={{ overflowX: "auto" }}>
                  <Table aria-label="Un-statementable gifts">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Amount</Table.Th>
                        <Table.Th>Fund</Table.Th>
                        <Table.Th>Donor</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {preview.unstatementable.map((gift) => (
                        <Table.Tr key={gift.giftId}>
                          <Table.Td>{gift.date}</Table.Td>
                          <Table.Td>{formatMoney(gift.amountCents, gift.currency)}</Table.Td>
                          <Table.Td>{gift.fund}</Table.Td>
                          <Table.Td>{gift.donor}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>
              </Stack>
            ) : null}
          </Stack>
        </Paper>
      ) : null}

      <div aria-live="polite">
        {sendError ? (
          <Alert color="red" variant="light" role="alert" title="Statements not sent">
            {sendError}
          </Alert>
        ) : null}
        {summary ? (
          <Alert color="teal" variant="light" title="Statements sent">
            <Text fz="sm">
              Sent {summary.summary.sent}. Skipped {summary.summary.skippedTotal}
              {summary.summary.skippedTotal > 0
                ? ` (no email ${summary.summary.skipped.no_email}, opted out ${summary.summary.skipped.opted_out}, suppressed ${summary.summary.skipped.suppressed}, already sent ${summary.summary.skipped.already_sent})`
                : ""}
              . Failed {summary.summary.failed}.
            </Text>
            {summary.summary.complete === false ? (
              <Text fz="sm" fw={600} mt={4}>
                Partly sent — run Send again to continue ({summary.summary.remaining} {summary.summary.remaining === 1 ? "donor" : "donors"} left).
              </Text>
            ) : null}
            {summary.summary.failed > 0 ? (
              <Text fz="xs" c="dimmed" mt={4}>
                Send again to retry the failed ones; donors already emailed are not emailed twice.
              </Text>
            ) : null}
          </Alert>
        ) : null}
      </div>

      <Modal
        opened={confirmOpen}
        onClose={() => {
          if (!isSending) setConfirmOpen(false);
        }}
        title="Email statements?"
        centered
      >
        <Stack gap="md">
          <Text fz="sm">
            {preview?.emailCount ?? 0} {preview?.emailCount === 1 ? "donor" : "donors"} will be emailed their statement for{" "}
            {preview?.range.start} to {preview?.range.end}. {preview?.skipCount ?? 0} will be skipped.
          </Text>
          <Text fz="xs" c="dimmed">
            Donors who already received a statement for this range are not emailed again.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setConfirmOpen(false)} disabled={isSending}>
              Cancel
            </Button>
            <Button onClick={runSend} loading={isSending} disabled={isSending}>
              Confirm and send
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
