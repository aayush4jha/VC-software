'use client';

import React from 'react';
import { useAppContext } from '@/lib/context';
import { INVESTMENT_VEHICLES } from '@/types/database';
import RegistrySelect from './RegistrySelect';

/**
 * The investment-entity picker: one registry of entity names shared by every
 * page that names an entity — Portfolio (entry round, follow-ons, detail
 * panel), Legal (the SOP's investment entity) and Fund (the entities holding
 * the bank balances). Each page used to keep its own list, which is how the
 * same entity was called DVPL on one page and DVLLP on another.
 *
 * The database calls this investment_vehicle (table investment_vehicles); the
 * screens all say "Investment Entity". Renaming the column is a migration for
 * no behavioural gain, so the two names coexist deliberately.
 */
export default function InvestmentEntitySelect({
    value,
    onChange,
    labelFontSize,
}: {
    value: string;
    onChange: (name: string) => void;
    labelFontSize?: number;
}) {
    const { investmentVehicles, addInvestmentVehicle, deleteInvestmentVehicle } = useAppContext();

    // Falls back to the built-in names when the registry table does not exist
    // yet, so the list is never empty. Those have no id and cannot be deleted.
    const rows = investmentVehicles.length > 0
        ? investmentVehicles
        : INVESTMENT_VEHICLES.map(name => ({ id: '', name }));

    return (
        <RegistrySelect
            value={value}
            onChange={onChange}
            rows={rows}
            onAdd={addInvestmentVehicle}
            onDelete={deleteInvestmentVehicle}
            placeholder="Select entity"
            addLabel="Add new entity"
            namePlaceholder="Entity name"
            labelFontSize={labelFontSize}
        />
    );
}
