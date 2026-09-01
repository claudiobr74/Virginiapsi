import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientAvatar } from "@/features/patients/components/patient-avatar";
import { ProfessionalAvatar } from "@/features/settings/components/professional-avatar";

describe("avatars de identificação", () => {
  it("mostra a foto do paciente quando há URL assinada", () => {
    const { getByAltText } = render(
      <PatientAvatar name="Beatriz" photoUrl="https://signed.example/portrait.jpg" size="card" />,
    );
    expect(getByAltText("Foto de Beatriz")).toHaveAttribute(
      "src",
      "https://signed.example/portrait.jpg",
    );
  });

  it("cai na inicial sem foto", () => {
    const { getByText, queryByRole } = render(<PatientAvatar name="Beatriz" size="card" />);
    expect(getByText("B")).toBeTruthy();
    expect(queryByRole("img")).toBeNull();
  });

  it("o tamanho card não altera md/hub/lg", () => {
    const { container: card } = render(<PatientAvatar name="A" size="card" />);
    const { container: md } = render(<PatientAvatar name="A" size="md" />);
    const { container: hub } = render(<PatientAvatar name="A" size="hub" />);
    expect(card.firstElementChild?.className).toContain("size-14");
    expect(md.firstElementChild?.className).toContain("size-11");
    expect(hub.firstElementChild?.className).toContain("size-16");
  });

  it("hero do Meu Dia é maior que md e não altera lg das Configurações", () => {
    const { container: hero } = render(<ProfessionalAvatar name="Ana" size="hero" />);
    const { container: md } = render(<ProfessionalAvatar name="Ana" size="md" />);
    const { container: lg } = render(<ProfessionalAvatar name="Ana" size="lg" />);
    expect(hero.firstElementChild?.className).toContain("size-20");
    expect(hero.firstElementChild?.className).toContain("lg:size-28");
    expect(md.firstElementChild?.className).toMatch(/\bsize-12\b/);
    expect(lg.firstElementChild?.className).toMatch(/\bsize-20\b/);
    expect(lg.firstElementChild?.className).not.toContain("lg:size-28");
  });
});
