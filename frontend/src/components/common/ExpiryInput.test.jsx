import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ExpiryInput from "./ExpiryInput";

afterEach(cleanup);

function ControlledExpiryInput({ value = null, precision = null }) {
  const [expiry, setExpiry] = useState({ value, precision });
  return (
    <>
      <ExpiryInput
        aria-label="ED"
        value={expiry.value}
        precision={expiry.precision}
        onChange={(nextValue, nextPrecision) =>
          setExpiry({ value: nextValue, precision: nextPrecision })
        }
      />
      <output aria-label="ED tersimpan">
        {JSON.stringify(expiry)}
      </output>
    </>
  );
}

function selectMode(name) {
  const option = screen.getByRole("option", { name });
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: option.value },
  });
}

describe("ExpiryInput", () => {
  it.each([undefined, null, "day"])(
    "membuka edit tanggal exact dengan precision %s tanpa mengubah hari",
    (precision) => {
      const onChange = vi.fn();
      const { rerender } = render(
        <ExpiryInput
          aria-label="ED"
          value="2027-05-12"
          precision={precision}
          onChange={onChange}
        />,
      );

      expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
      expect(screen.getByLabelText("ED")).toHaveValue("2027-05-12");
      expect(
        screen.getByRole("option", { name: /Tanggal lengkap/i }).selected,
      ).toBe(true);

      rerender(
        <ExpiryInput
          aria-label="ED"
          value="2027-05-12"
          precision={precision}
          onChange={onChange}
          disabled={false}
        />,
      );
      expect(screen.getByLabelText("ED")).toHaveValue("2027-05-12");
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("tanggal legacy akhir bulan tidak otomatis menjadi mode month", () => {
    const onChange = vi.fn();
    render(<ExpiryInput aria-label="ED" value="2028-02-29" onChange={onChange} />);

    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("ED")).toHaveValue("2028-02-29");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("timestamp legacy dibuka sebagai tanggal sumber tanpa callback saat edit", () => {
    const onChange = vi.fn();
    render(
      <ExpiryInput
        aria-label="ED"
        value="2027-05-12T00:00:00.000Z"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("ED")).toHaveValue("2027-05-12");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("edit month memakai input bulan YYYY-MM tanpa menulis ulang DATE canonical", () => {
    const onChange = vi.fn();
    render(
      <ExpiryInput
        aria-label="ED"
        value="2028-02-29"
        precision="month"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "month");
    expect(screen.getByLabelText("ED")).toHaveValue("2028-02");
    expect(
      screen.getByRole("option", { name: /Bulan.*tahun/i }).selected,
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("ED"), { target: { value: "2028-03" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2028-03", "month");
  });

  it("ED baru kosong default month dan tidak mengarang tanggal saat mount", () => {
    const onChange = vi.fn();
    render(
      <ExpiryInput aria-label="ED" value={null} precision={null} onChange={onChange} />,
    );

    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "month");
    expect(screen.getByLabelText("ED")).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pemilihan month secara eksplisit mengubah payload exact menjadi YYYY-MM", () => {
    render(<ControlledExpiryInput value="2027-05-12" />);

    selectMode(/Bulan.*tahun/i);
    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "month");
    expect(screen.getByLabelText("ED")).toHaveValue("2027-05");
    expect(screen.getByLabelText("ED tersimpan")).toHaveTextContent(
      '{"value":"2027-05","precision":"month"}',
    );
  });

  it.each(["2028-02-29", "2028-02"])(
    "pemilihan day secara eksplisit memakai akhir bulan kabisat dari %s",
    (value) => {
      render(<ControlledExpiryInput value={value} precision="month" />);

      selectMode(/Tanggal lengkap/i);
      expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
      expect(screen.getByLabelText("ED")).toHaveValue("2028-02-29");
      expect(screen.getByLabelText("ED tersimpan")).toHaveTextContent(
        '{"value":"2028-02-29","precision":"day"}',
      );

      fireEvent.change(screen.getByLabelText("ED"), { target: { value: "2028-02-12" } });
      expect(screen.getByLabelText("ED tersimpan")).toHaveTextContent(
        '{"value":"2028-02-12","precision":"day"}',
      );
    },
  );

  it("mode day pada input kosong tetap bisa dipilih tanpa mengarang tanggal", () => {
    render(<ControlledExpiryInput />);

    selectMode(/Tanggal lengkap/i);
    expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("ED")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("ED"), { target: { value: "2027-05-12" } });
    expect(screen.getByLabelText("ED tersimpan")).toHaveTextContent(
      '{"value":"2027-05-12","precision":"day"}',
    );
  });

  it.each([
    ["2028-02-29", "month"],
    ["2027-05-12", "day"],
  ])("menghapus ED %s (%s) mengosongkan tanggal dan precision", (value, precision) => {
    render(<ControlledExpiryInput value={value} precision={precision} />);

    fireEvent.change(screen.getByLabelText("ED"), { target: { value: "" } });
    expect(screen.getByLabelText("ED")).toHaveValue("");
    expect(screen.getByLabelText("ED tersimpan")).toHaveTextContent(
      '{"value":null,"precision":null}',
    );
  });
});
