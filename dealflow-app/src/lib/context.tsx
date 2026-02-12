'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Company } from '@/types/database';

interface AppContextType {
    selectedCompany: Company | null;
    setSelectedCompany: (company: Company | null) => void;
    editingCompany: Company | null;
    setEditingCompany: (company: Company | null) => void;
    showNotifications: boolean;
    setShowNotifications: (show: boolean) => void;
    showRejectionFlow: boolean;
    setShowRejectionFlow: (show: boolean) => void;
    showEmailCompose: boolean;
    setShowEmailCompose: (show: boolean) => void;
    showCalendarInvite: boolean;
    setShowCalendarInvite: (show: boolean) => void;
    showCompanyForm: boolean;
    setShowCompanyForm: (show: boolean) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    viewMode: 'kanban' | 'table';
    setViewMode: (mode: 'kanban' | 'table') => void;
    activeFilters: Record<string, string[]>;
    setActiveFilters: (filters: Record<string, string[]>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showRejectionFlow, setShowRejectionFlow] = useState(false);
    const [showEmailCompose, setShowEmailCompose] = useState(false);
    const [showCalendarInvite, setShowCalendarInvite] = useState(false);
    const [showCompanyForm, setShowCompanyForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

    return (
        <AppContext.Provider value={{
            selectedCompany, setSelectedCompany,
            editingCompany, setEditingCompany,
            showNotifications, setShowNotifications,
            showRejectionFlow, setShowRejectionFlow,
            showEmailCompose, setShowEmailCompose,
            showCalendarInvite, setShowCalendarInvite,
            showCompanyForm, setShowCompanyForm,
            searchQuery, setSearchQuery,
            viewMode, setViewMode,
            activeFilters, setActiveFilters,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useAppContext must be used within AppProvider');
    return ctx;
}
