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

const modeSelect = () => screen.getByRole("combobox", { name: "Presisi ED" });
const monthSelect = () => screen.getByRole("combobox", { name: "Bulan ED" });
const yearSelect = () => screen.getByRole("combobox", { name: "Tahun ED" });
const savedValue = () => screen.getByLabelText("ED tersimpan");

function selectMode(name) {
  const option = screen.getByRole("option", { name });
  fireEvent.change(modeSelect(), { target: { value: option.value } });
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

  it("edit month memakai dropdown bulan+tahun dan tidak menulis ulang DATE canonical saat mount", () => {
    const onChange = vi.fn();
    render(
      <ExpiryInput
        aria-label="ED"
        value="2028-02-29"
        precision="month"
        onChange={onChange}
      />,
    );

    expect(monthSelect()).toHaveValue("02");
    expect(yearSelect()).toHaveValue("2028");
    expect(
      screen.getByRole("option", { name: /Bulan.*tahun/i }).selected,
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(monthSelect(), { target: { value: "03" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2028-03", "month");
  });

  it("ED baru kosong default month dan tidak mengarang tanggal saat mount", () => {
    const onChange = vi.fn();
    render(
      <ExpiryInput aria-label="ED" value={null} precision={null} onChange={onChange} />,
    );

    expect(monthSelect()).toHaveValue("");
    expect(yearSelect()).toHaveValue("");
    expect(
      screen.getByRole("option", { name: /Bulan.*tahun/i }).selected,
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pemilihan month secara eksplisit mengubah payload exact menjadi YYYY-MM", () => {
    render(<ControlledExpiryInput value="2027-05-12" />);

    selectMode(/Bulan.*tahun/i);
    expect(monthSelect()).toHaveValue("05");
    expect(yearSelect()).toHaveValue("2027");
    expect(savedValue()).toHaveTextContent('{"value":"2027-05","precision":"month"}');
  });

  it("memilih tahun lebih dulu lalu bulan tetap menghasilkan YYYY-MM", () => {
    render(<ControlledExpiryInput />);

    fireEvent.change(yearSelect(), { target: { value: "2030" } });
    expect(yearSelect()).toHaveValue("2030");
    expect(savedValue()).toHaveTextContent('{"value":null,"precision":null}');

    fireEvent.change(monthSelect(), { target: { value: "07" } });
    expect(savedValue()).toHaveTextContent('{"value":"2030-07","precision":"month"}');
  });

  it("nilai bulan tanpa metadata presisi tetap dirender mode bulan (tidak kosong)", () => {
    render(<ExpiryInput aria-label="ED" value="2027-05" onChange={() => {}} />);

    expect(monthSelect()).toHaveValue("05");
    expect(yearSelect()).toHaveValue("2027");
  });

  it.each(["2028-02-29", "2028-02"])(
    "pemilihan day secara eksplisit memakai akhir bulan kabisat dari %s",
    (value) => {
      render(<ControlledExpiryInput value={value} precision="month" />);

      selectMode(/Tanggal lengkap/i);
      expect(screen.getByLabelText("ED")).toHaveAttribute("type", "date");
      expect(screen.getByLabelText("ED")).toHaveValue("2028-02-29");
      expect(savedValue()).toHaveTextContent(
        '{"value":"2028-02-29","precision":"day"}',
      );

      fireEvent.change(screen.getByLabelText("ED"), { target: { value: "2028-02-12" } });
      expect(savedValue()).toHaveTextContent(
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
    expect(savedValue()).toHaveTextContent('{"value":"2027-05-12","precision":"day"}');
  });

  it("menghapus ED bulan mengosongkan bulan, tanggal, dan precision", () => {
    render(<ControlledExpiryInput value="2028-02-29" precision="month" />);

    fireEvent.change(monthSelect(), { target: { value: "" } });
    expect(monthSelect()).toHaveValue("");
    expect(savedValue()).toHaveTextContent('{"value":null,"precision":null}');
  });

  it("menghapus ED tanggal lengkap mengosongkan tanggal dan precision", () => {
    render(<ControlledExpiryInput value="2027-05-12" precision="day" />);

    fireEvent.change(screen.getByLabelText("ED"), { target: { value: "" } });
    expect(screen.getByLabelText("ED")).toHaveValue("");
    expect(savedValue()).toHaveTextContent('{"value":null,"precision":null}');
  });
});
