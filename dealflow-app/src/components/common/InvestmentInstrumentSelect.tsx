'use client';

import React from 'react';
import { useAppContext } from '@/lib/context';
import { INVESTMENT_INSTRUMENTS } from '@/types/database';
import RegistrySelect from './RegistrySelect';

/**
 * What the money bought: CCPS, CCD, Debt, Common Equity — or anything else the
 * team adds. Separate from investment type (Primary / Secondary / Debt), which
 * says how the stake was acquired rather than what instrument was issued.
 *
 * Editable like the entity registry, and stored on the investment as a name,
 * so removing an instrument from the list never rewrites an investment that
 * already records it.
 */
export default function InvestmentInstrumentSelect({
    value,
    onChange,
    labelFontSize,
}: {
    value: string;
    onChange: (name: string) => void;
    labelFontSize?: number;
}) {
    const { investmentInstruments, addInvestmentInstrument, deleteInvestmentInstrument } = useAppContext();

    const rows = investmentInstruments.length > 0
        ? investmentInstruments
        : INVESTMENT_INSTRUMENTS.map(name => ({ id: '', name }));

    return (
        <RegistrySelect
            value={value}
            onChange={onChange}
            rows={rows}
            onAdd={addInvestmentInstrument}
            onDelete={deleteInvestmentInstrument}
            placeholder="Select instrument"
            addLabel="Add new instrument"
            namePlaceholder="Instrument name"
            labelFontSize={labelFontSize}
        />
    );
}
