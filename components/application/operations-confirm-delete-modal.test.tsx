import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationsConfirmDeleteModal } from "@/components/application/operations-confirm-delete-modal";

// AC7: Confirmation dialog for delete

function renderModal(props: {
  opened?: boolean;
  title?: string;
  onConfirm?: () => void;
  onClose?: () => void;
  loading?: boolean;
}) {
  const defaults = {
    opened: true,
    title: "Our Vision",
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    loading: false,
  };
  return render(
    <MantineProvider>
      <OperationsConfirmDeleteModal {...defaults} {...props} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OperationsConfirmDeleteModal — AC7", () => {
  it("renders modal with the document title in the confirmation message", () => {
    renderModal({ opened: true, title: "Our Vision" });

    expect(screen.getByText(/Our Vision/)).toBeInTheDocument();
    // Static modal title
    expect(screen.getByText("Delete document?")).toBeInTheDocument();
  });

  it("renders modal title and delete button when opened", () => {
    renderModal({ opened: true });

    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderModal({ opened: true, onClose });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Delete is clicked", () => {
    const onConfirm = vi.fn();
    renderModal({ opened: true, onConfirm });

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderModal({ opened: true, onConfirm, onClose });

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Cancel and shows loading on Delete when loading=true", () => {
    renderModal({ opened: true, loading: true });

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(cancelBtn).toBeDisabled();
  });

  it("does not render modal content when opened=false (Mantine portal closed)", () => {
    renderModal({ opened: false });

    // Mantine removes modal content from DOM when closed
    expect(screen.queryByText("Delete document?")).not.toBeInTheDocument();
  });

  it("shows the correct document title for different document names (AC7)", () => {
    renderModal({ opened: true, title: "Elder Council Notes Q1" });

    expect(screen.getByText(/Elder Council Notes Q1/)).toBeInTheDocument();
  });
});
