import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "@/components/ui/search-field";

function ControlledSearchField() {
  const [value, setValue] = useState("");
  return <SearchField value={value} onChange={setValue} />;
}

describe("SearchField", () => {
  it("chama onChange ao digitar e permite limpar", async () => {
    render(<ControlledSearchField />);
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "Maria");
    expect(input).toHaveValue("Maria");

    const clearButton = screen.getByRole("button", { name: "Limpar busca" });
    await userEvent.click(clearButton);
    expect(input).toHaveValue("");
  });

  it("dispara onChange controlado sem estado interno", async () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole("searchbox"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });
});
