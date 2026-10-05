import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/send-email", () => ({ sendEmail: sendEmailMock }));

import { fakeDb } from "@/lib/stripe/fake-db.testing";
import { NOT_A_DONATION_NOTICE, sendRegistrationReceipt } from "@/lib/stripe/registration-receipt";

type Row = Record<string, unknown>;

const payment = (extra: Row = {}): Row => ({
  id: "pay-1",
  church_id: "church-1",
  registration_id: "reg-1",
  status: "succeeded",
  amount_cents: 2500,
  currency: "usd",
  receipt_claimed_at: null,
  receipt_sent_at: null,
  ...extra,
});

function seed(opts: { payment?: Row; registration?: Row; church?: Row; event?: Row } = {}) {
  return fakeDb({
    event_registration_payments: [opts.payment ?? payment()],
    event_registrations: [
      { id: "reg-1", church_id: "church-1", event_id: "evt-1", registrant_name: "Maya Cruz", registrant_email: "maya@example.org", ...opts.registration },
    ],
    // 2026-10-10T01:30Z is 9:30 PM on Oct 9 in New York, a different UTC day.
    events: [{ id: "evt-1", church_id: "church-1", title: "Fall Retreat", starts_at: "2026-10-10T01:30:00Z", ...opts.event }],
    churches: [
      {
        id: "church-1",
        name: "Grace Chapel",
        timezone: "America/New_York",
        mailing_address: "1 Main St, Ponce, PR",
        contact_email: "office@grace.example",
        ...opts.church,
      },
    ],
  });
}

describe("sendRegistrationReceipt (G3.3b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ accepted: true });
  });

  it("sends the receipt with church, event in church-local time, registrant, amount, reference and the not-deductible line", async () => {
    const db = seed();
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0][0];
    expect(mail.to).toBe("maya@example.org");
    expect(mail.idempotencyKey).toBe("pay-1");
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("Grace Chapel");
      expect(body).toContain("1 Main St, Ponce, PR");
      expect(body).toContain("office@grace.example");
      expect(body).toContain("Fall Retreat");
      expect(body).toContain("Maya Cruz");
      expect(body).toContain("$25.00");
      expect(body).toContain("pay-1");
      expect(body).toContain(NOT_A_DONATION_NOTICE);
      // church-local day (Oct 9, 9:30 PM), not the UTC day (Oct 10)
      expect(body).toContain("Friday, October 9, 2026");
      expect(body).toContain("9:30");
    }
    expect(NOT_A_DONATION_NOTICE).toBe("This is a receipt for an event registration fee. It is not a tax-deductible donation receipt.");
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeTruthy();
  });

  it("omits the address and contact when the church has none", async () => {
    const db = seed({ church: { mailing_address: null, contact_email: null } });
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    const mail = sendEmailMock.mock.calls[0][0];
    expect(mail.text).not.toContain("Contact:");
    expect(mail.html).not.toContain("Contact:");
  });

  it("HTML-escapes the registrant, event and church names", async () => {
    const db = seed({
      registration: { registrant_name: "<img src=x onerror=alert(1)>" },
      event: { title: "Fish & <b>Chips</b>" },
      church: { name: "St. \"Mark's\" <script>" },
    });
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Chips");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Fish &amp; &lt;b&gt;Chips&lt;/b&gt;");
    expect(html).toContain("St. &quot;Mark&#39;s&quot; &lt;script&gt;");
  });

  it("claims before sending: the claim is set when the provider is called, and a second call sends nothing", async () => {
    const db = seed();
    sendEmailMock.mockImplementationOnce(async () => {
      expect(db.tables.event_registration_payments[0].receipt_claimed_at).toBeTruthy();
      expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeNull();
      return { accepted: true };
    });
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("does not send while another attempt holds a fresh claim", async () => {
    const db = seed({ payment: payment({ receipt_claimed_at: new Date().toISOString() }) });
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeNull();
  });

  it("takes over a claim older than the 5-minute lease", async () => {
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    const db = seed({ payment: payment({ receipt_claimed_at: stale }) });
    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeTruthy();
  });

  it("releases the claim and throws when the provider refuses, so a retry sends it", async () => {
    const db = seed();
    sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "bounced" });
    await expect(sendRegistrationReceipt(db.client, "church-1", "reg-1")).rejects.toThrow(/refused: bounced/);
    expect(db.tables.event_registration_payments[0].receipt_claimed_at).toBeNull();
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeNull();

    await sendRegistrationReceipt(db.client, "church-1", "reg-1");
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeTruthy();
  });

  it("leaves the receipt unsent, releases the claim and does not throw when no email provider is configured (Council Review 42)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = seed();
    sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "provider_not_configured" });
    await expect(sendRegistrationReceipt(db.client, "church-1", "reg-1")).resolves.toBeUndefined();
    expect(db.tables.event_registration_payments[0].receipt_claimed_at).toBeNull();
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not configured"), { paymentId: "pay-1" });
    warn.mockRestore();
  });

  it("sends nothing and does not throw when the registration has no email, and releases the claim", async () => {
    const db = seed({ registration: { registrant_email: null } });
    await expect(sendRegistrationReceipt(db.client, "church-1", "reg-1")).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(db.tables.event_registration_payments[0].receipt_claimed_at).toBeNull();
    expect(db.tables.event_registration_payments[0].receipt_sent_at).toBeNull();
  });

  it("does nothing unless the payment succeeded", async () => {
    for (const status of ["pending", "failed", "refunded"]) {
      const db = seed({ payment: payment({ status }) });
      await sendRegistrationReceipt(db.client, "church-1", "reg-1");
      expect(db.tables.event_registration_payments[0].receipt_claimed_at).toBeNull();
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does nothing for a registration with no payment row (free or walk-in) and stays inside its church", async () => {
    const db = seed();
    await sendRegistrationReceipt(db.client, "church-1", "reg-none");
    await sendRegistrationReceipt(db.client, "church-2", "reg-1");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("throws on a database error, and on a failed receipt_sent_at write", async () => {
    const claimFails = seed();
    claimFails.failOn.add("event_registration_payments");
    await expect(sendRegistrationReceipt(claimFails.client, "church-1", "reg-1")).rejects.toThrow(/write failed/);
    expect(sendEmailMock).not.toHaveBeenCalled();

    const markFails = seed();
    sendEmailMock.mockImplementationOnce(async () => {
      markFails.failOn.add("event_registration_payments");
      return { accepted: true };
    });
    await expect(sendRegistrationReceipt(markFails.client, "church-1", "reg-1")).rejects.toThrow(/write failed/);
  });
});
