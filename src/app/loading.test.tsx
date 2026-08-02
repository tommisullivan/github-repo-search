import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("Loading", () => {
  it("renders a status role with the Japanese loading message", () => {
    render(<Loading />);

    const status = screen.getByRole("status", { name: /読み込み/ });
    expect(status).toBeInTheDocument();
  });
});
