import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatientPhotoField } from "@/features/patients/components/patient-photo-field";
import { PORTRAIT_MAX_BYTES } from "@/features/patients/portrait";

beforeEach(() => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fileInput(): HTMLInputElement {
  return document.querySelector(
    'input[type="file"][accept="image/jpeg,image/png,image/webp"]',
  ) as HTMLInputElement;
}

describe("PatientPhotoField", () => {
  it("rejeita MIME inválido no envio de arquivo", () => {
    const onFileChange = vi.fn();
    render(<PatientPhotoField name="Ana" onFileChange={onFileChange} />);
    const file = new File(["nope"], "nota.txt", { type: "text/plain" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(onFileChange).not.toHaveBeenCalled();
    expect(screen.getByText("Use uma imagem JPEG, PNG ou WebP.")).toBeInTheDocument();
  });

  it("rejeita arquivo maior que 5 MB", () => {
    const onFileChange = vi.fn();
    render(<PatientPhotoField name="Ana" onFileChange={onFileChange} />);
    const file = new File([new Uint8Array(PORTRAIT_MAX_BYTES + 1)], "grande.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(onFileChange).not.toHaveBeenCalled();
    expect(screen.getByText("A foto deve ter no máximo 5 MB.")).toBeInTheDocument();
  });

  it("aceita JPEG válido e mostra preview", () => {
    const onFileChange = vi.fn();
    render(<PatientPhotoField name="Ana" onFileChange={onFileChange} />);
    const file = new File([Uint8Array.from([1, 2, 3])], "retrato.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0]).toBeInstanceOf(File);
    expect(screen.getByRole("img", { name: "Foto de Ana" })).toHaveAttribute("src", "blob:preview");
  });

  it("usa captura nativa quando getUserMedia não está disponível", () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    const onFileChange = vi.fn();
    render(<PatientPhotoField name="Ana" onFileChange={onFileChange} />);
    const native = document.querySelector('input[capture="user"]') as HTMLInputElement;
    const click = vi.spyOn(native, "click");
    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("mostra erro humano quando a permissão da câmera é negada", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    render(<PatientPhotoField name="Ana" onFileChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar foto" }));
    expect(
      await screen.findByText(/permissão da câmera foi negada/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capturar" })).toBeDisabled();
  });
});
