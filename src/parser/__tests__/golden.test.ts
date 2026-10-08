import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseMessage as parse } from '../index';

const opt = { today: '2026-09-30', season: { from: '2026-10-11', to: '2026-10-19' }, prices: { solo: 650, couple: 1200 } };
const p = (t: string) => parse(t, opt);
const one = (t: string) => { const r = p(t); expect(r).toHaveLength(1); return r[0]!; };

const M1 = 'Divya Achariya Divi Pass\nName : tanmay Jain\nPass : 1 couple\nNo : +919426672046';
const M2 = 'Name ; niyati patel\nPass : 2 solo\nNo : 9913803737\nDate : 16th october Friday';
const M3 = 'Name : vanshika banodia\nPass : 5 solo\nNo : +919313585913\nDate : 16th october Friday';
const P6 = '₹1,300 Paid to Bhanderi Raj 30 Sep 2026 1:06pm UTC UPI transaction ID 627325985997';

describe('real messages', () => {
  it('1 tanmay', () => {
    const d = one(M1);
    expect(d).toMatchObject({ name: 'Tanmay Jain', phone: '+919426672046', lines: [{ kind: 'couple', qty: 1 }] });
    expect(d.eventDate).toBeUndefined();
    expect(d.confidence).toMatchObject({ name: 'H', phone: 'H', lines: 'H' });
    expect(d.warnings).toEqual(['no-date']);
  });
  it('2 niyati', () => {
    const d = one(M2);
    expect(d).toMatchObject({ name: 'Niyati Patel', phone: '+919913803737', lines: [{ kind: 'solo', qty: 2 }], eventDate: '2026-10-16' });
    expect(d.warnings).toEqual([]);
  });
  it('3 vanshika', () => {
    const d = one(M3);
    expect(d).toMatchObject({ name: 'Vanshika Banodia', phone: '+919313585913', lines: [{ kind: 'solo', qty: 5 }], eventDate: '2026-10-16' });
  });
  it('4 with 2600 + 650', () => {
    const d = one(M3 + '\n2600 + 650');
    expect(d.amounts).toEqual([2600, 650]); expect(d.total).toBe(3250); expect(d.warnings).toEqual([]);
  });
});

describe('payment texts', () => {
  it('5 gpay card', () => {
    const d = one('₹650\nPaid to Bhanderi Raj\n30 Sep 2026, 1:10 pm\nUPI transaction ID 627326018483');
    expect(d).toMatchObject({ kind: 'payment', amounts: [650], total: 650, utr: '627326018483', party: { role: 'paidTo', name: 'Bhanderi Raj' }, paidAt: Date.UTC(2026, 8, 30, 7, 40) });
    expect(d.phone).toBeUndefined();
  });
  it('6 explicit UTC zone', () => {
    const d = one(P6);
    expect(d).toMatchObject({ amounts: [1300], utr: '627325985997', paidAt: Date.UTC(2026, 8, 30, 13, 6) });
  });
  it('7 dev kinner', () => {
    const d = one('₹2,600\nPaid to Dev Kinner Trivedi\n29 Sep 2026, 10:38 pm\nUPI transaction ID 627223546951');
    expect(d).toMatchObject({ amounts: [2600], party: { name: 'Dev Kinner Trivedi' }, utr: '627223546951', paidAt: Date.UTC(2026, 8, 29, 17, 8) });
  });
  it('8 phonepe ignores T id', () => {
    const d = one('Paid ₹1300 to Bhanderi Raj\nTransaction ID T2609301306451234567\nUTR: 627325985997');
    expect(d).toMatchObject({ utr: '627325985997', amounts: [1300], party: { name: 'Bhanderi Raj' } });
  });
  it('9 received from', () => {
    const d = one('Received from Niyati Patel ₹1,300\nUPI Ref No 627325985997');
    expect(d).toMatchObject({ party: { role: 'receivedFrom', name: 'Niyati Patel' }, amounts: [1300], utr: '627325985997' });
  });
});

describe('phones', () => {
  it.each([
    ['No : 0 99138 03737', '+919913803737'], ['Mobile- 91 9913803737', '+919913803737'],
    ['No : +91 99138-03737', '+919913803737'],
  ])('%s', (t, e) => expect(one(t).phone).toBe(e));
  it('12 two numbers', () => {
    const d = one('No: 9913803737 / 9426672046');
    expect(d.phone).toBe('+919913803737'); expect(d.altPhones).toEqual(['+919426672046']); expect(d.warnings).toContain('multiple-phones');
  });
  it('13 invalid', () => {
    const d = one('Name: Ravi\nNo : 5913803737');
    expect(d.phone).toBeUndefined(); expect(d.warnings).toContain('invalid-phone:5913803737');
  });
  it('14 bare utr', () => {
    const d = one('Name: Ravi\n627326018483');
    expect(d.utr).toBe('627326018483'); expect(d.phone).toBeUndefined();
  });
  it('property: 12-digit run is never a phone', () =>
    fc.assert(fc.property(fc.stringMatching(/^[1-9]\d{11}$/), (n) => {
      const r = parse(`Name: Ravi\n${n}`, opt);
      expect(r[0]?.phone).toBeUndefined();
    })));
});

describe('passes', () => {
  it.each([
    ['Pass : 1 couple + 2 solo', [{ kind: 'couple', qty: 1 }, { kind: 'solo', qty: 2 }]],
    ['Pass :\n2 solo\n1 couple', [{ kind: 'solo', qty: 2 }, { kind: 'couple', qty: 1 }]],
    ['Pass : couple', [{ kind: 'couple', qty: 1 }]],
    ['Pass : 2 cpl 1 stag', [{ kind: 'couple', qty: 2 }, { kind: 'solo', qty: 1 }]],
    ['Pass: 1 pair', [{ kind: 'couple', qty: 1 }]],
    ['Pass : do couple', [{ kind: 'couple', qty: 2 }]],
    ['Pass : be solo', [{ kind: 'solo', qty: 2 }]],
    ['Pass : ek couple', [{ kind: 'couple', qty: 1 }]],
    ['Pass : ३ solo', [{ kind: 'solo', qty: 3 }]],
    ['Pass : ૨ couple', [{ kind: 'couple', qty: 2 }]],
  ])('%s', (t, lines) => expect(one(t).lines).toEqual(lines));
  it('confidence', () => {
    expect(one('Pass : couple').confidence.lines).toBe('M');
    expect(one('Pass : 1 couple').confidence.lines).toBe('H');
  });
  it('18 unknown kind', () => {
    const d = one('Pass : 3');
    expect(d.lines).toEqual([{ kind: 'unknown', qty: 3 }]); expect(d.confidence.lines).toBe('L'); expect(d.warnings).toContain('pass-kind-unknown');
  });
});

describe('dates', () => {
  it.each([['Date : 16/10'], ['Date: 16-10-26'], ['Date 16 Oct']])('%s', (t) => expect(one(t).eventDate).toBe('2026-10-16'));
  it('23 weekday mismatch', () => {
    const d = one('Date : 16th october Thursday');
    expect(d.eventDate).toBe('2026-10-16'); expect(d.warnings).toContain('weekday-mismatch:Thursday≠Friday');
  });
  it('24 year rolls forward', () => {
    const d = one('Date : 5 Jan');
    expect(d.eventDate).toBe('2027-01-05'); expect(d.warnings).toContain('year-assumed:2027');
  });
  it('25 season', () => {
    expect(one('Date : 12/10').confidence.eventDate).toBe('H');
    const d = one('Date : 10/12');
    expect(d.eventDate).toBe('2026-12-10'); expect(d.confidence.eventDate).toBe('M'); expect(d.warnings).toContain('out-of-season');
  });
});

describe('amounts', () => {
  it.each([['Rs 3,250/-', 3250], ['₹3250', 3250], ['3.25k', 3250], ['1300 rs', 1300]])('%s', (t, v) => expect(one(t).total).toBe(v));
  it('27 mismatch', () => {
    const d = one('Pass : 2 solo\nTotal 1000');
    expect(d.total).toBe(1000); expect(d.warnings).toContain('amount-mismatch:expected 1300');
  });
});

describe('structure', () => {
  it('28 whatsapp export prefixes are not the date', () => {
    const d = one('[30/09/26, 1:12:34 PM] Tanmay: Name : tanmay Jain\n[30/09/26, 1:12:40 PM] Tanmay: Pass : 1 couple\n[30/09/26, 1:12:45 PM] Tanmay: No : 9426672046');
    expect(d).toMatchObject({ name: 'Tanmay Jain', phone: '+919426672046' });
    expect(d.eventDate).toBeUndefined();
  });
  it('29 two blocks', () => {
    const r = p(M1 + '\n\n' + M2);
    expect(r.map((d) => d.name)).toEqual(['Tanmay Jain', 'Niyati Patel']);
  });
  it('30 sale + payment merge to mixed', () => {
    const d = one(M2 + '\n\n' + P6);
    expect(d.kind).toBe('mixed'); expect(d).toMatchObject({ name: 'Niyati Patel', utr: '627325985997', total: 1300 });
  });
  it('31 header alone', () => expect(p('Divya Achariya Divi Pass')).toEqual([]));
  it('32 gujarati labels', () => {
    expect(one('નામ : Riya Shah\nનંબર : 9426672046\nપાસ : 2 couple')).toMatchObject({ name: 'Riya Shah', phone: '+919426672046', lines: [{ kind: 'couple', qty: 2 }] });
  });
  it('33 noise', () => { expect(p('hi bro')).toEqual([]); expect(p('')).toEqual([]); });
  it('34 markdown/emoji', () => expect(one('Name : *Tanmay Jain* 🙏\nNo : 9426672046').name).toBe('Tanmay Jain'));
  it('35 deterministic hash and totals', () => {
    const t = 'Name: Ravi\nPass : 1 couple 2 solo\nDate 16 oct\nTotal 2500';
    const d = one(t);
    expect(d.lines).toEqual([{ kind: 'couple', qty: 1 }, { kind: 'solo', qty: 2 }]);
    expect(d.total).toBe(2500); expect(d.warnings).toEqual([]);
    expect(one(t).sourceHash).toBe(d.sourceHash);
  });
  it('never throws on garbage', () =>
    fc.assert(fc.property(fc.string(), (s) => { parse(s, opt); })));
});

describe('booking page message', () => {
  it('reads the WhatsApp text the public booking page sends', () => {
    const d = parse('Name : Test Buyer\nPass : 2 solo + 1 couple\nNo : 9876543210\nDate : 16 Oct Friday', { today: '2026-10-08', season: { from: '2026-10-11', to: '2026-10-20' }, prices: { solo: 1250, couple: 1950 } });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'sale', name: 'Test Buyer', phone: '+919876543210', eventDate: '2026-10-16', lines: [{ kind: 'solo', qty: 2 }, { kind: 'couple', qty: 1 }], warnings: [] });
  });
});
