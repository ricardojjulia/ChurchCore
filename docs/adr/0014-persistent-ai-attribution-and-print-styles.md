# ADR 0014: Persistent AI Attribution and Print Styles

* **Status:** Proposed  
* **Date:** 2026-06-21  
* **Authors:** Antigravity (Gemini Software Factory)  
* **Decisions:** [2026-06-21-council-review-5-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-21-council-review-5-synthesis.md)  

---

## Context and Problem Statement

Under the ChurchCore theological and ethical guardrails (Sprint 5 plan and `DEVELOPMENT_PLAN.md`), AI tools serve only as assistive drafting mechanisms. All AI responses must clearly display theological disclaimers noting that generated copy cannot replace prayer or scripture study.

While the UI displays a session confirmation gate (`DisclaimerGate`), the disclaimer is lost when pastors:
1. Copy-paste generated sermon outlines into external documents.
2. Print sermon outlines for study or distribution.

To maintain transparency, AI attribution must remain linked to the text data.

---

## Decision Drivers

* **Theological Guardrails**: Maintain the clear division between human/divine discernment and machine assistance.
* **Traceability & Attribution**: Ensure recipients of printed or copied guides are aware they are AI-generated drafts.

---

## Proposed Decisions

### 1. Payload Disclaimer Appending
Update server-side AI actions to append the theological disclaimer footer (`ELDER_AI_DISCLAIMER` or similar) directly to the end of the text returned by the model before writing to the database or returning to the client.

### 2. Print-Specific CSS Layouts
Implement a print media query in the global stylesheet (`index.css` or equivalent) that forces the `.ai-disclaimer-badge` block to remain visible and formatted at the bottom of the printed page:
```css
@media print {
  .ai-disclaimer-badge {
    display: block !important;
    font-style: italic;
    border-top: 1px solid #ccc;
    margin-top: 20px;
    padding-top: 10px;
  }
}
```

---

## Consequences

* **Positive**:
  - Ensures compliance with theological disclaimers even when outlines are copied or printed.
  - Prevents the circulating of machine-drafted content as fully human/divine sermon preparation.
* **Negative**:
  - Appended footers increase output string size slightly.
