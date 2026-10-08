import { describe, expect, it } from "vitest";
import { parseCamt053Xml } from "./camt053Parse";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>PRCD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-10-06</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1234.56</Amt><CdtDbtInd>DBIT</CdtDbtInd>
        <Dt><Dt>2026-10-07</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-10-07</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("parseCamt053Xml – Kontosalden", () => {
  it("liest nur den gebuchten Tagesendsaldo (CLBD) mit Vorzeichen", () => {
    const r = parseCamt053Xml(XML);
    expect(r.salden).toEqual([
      { iban: "DE89370400440532013000", stichtag: "2026-10-07", saldo: -1234.56 },
    ]);
    expect(r.buchungen).toHaveLength(1);
  });
});
