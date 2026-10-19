import type { DocField } from "@/lib/types"
import { INPUT_TYPES } from "./FieldInput"

export interface Section {
  key: string
  fieldname: string | null
  hidden: boolean
  label: string | null
  collapsible: boolean
  depends_on: string | null
  columns: DocField[][]
}

export interface Tab {
  key: string
  label: string
  sections: Section[]
}

/** Turns Frappe's flat field list (Tab/Section/Column breaks) into tabs → sections → columns. */
export function buildLayout(fields: DocField[]): Tab[] {
  const tabs: Tab[] = []
  let tab: Tab | null = null
  let section: Section | null = null

  const ensureTab = () => (tab ??= (tabs.push({ key: "t0", label: "Details", sections: [] }), tabs[tabs.length - 1]))
  const ensureSection = (): Section => {
    if (section) return section
    const t = ensureTab()
    section = { key: `${t.key}-s${t.sections.length}`, fieldname: null, hidden: false, label: null, collapsible: false, depends_on: null, columns: [[]] }
    t.sections.push(section)
    return section
  }

  for (const df of fields) {
    if (df.fieldtype === "Tab Break") {
      tab = { key: `t${tabs.length}`, label: df.label || "Details", sections: [] }
      tabs.push(tab)
      section = null
    } else if (df.fieldtype === "Section Break") {
      const t = ensureTab()
      section = { key: `${t.key}-s${t.sections.length}`, fieldname: df.fieldname, hidden: Boolean(df.hidden), label: df.label, collapsible: Boolean(df.collapsible), depends_on: df.depends_on, columns: [[]] }
      t.sections.push(section)
    } else if (df.fieldtype === "Column Break") {
      ensureSection().columns.push([])
    } else if (df.fieldtype === "Table" || INPUT_TYPES.includes(df.fieldtype)) {
      const s = ensureSection()
      s.columns[s.columns.length - 1].push(df)
    }
  }

  return tabs
    .map((t) => ({ ...t, sections: t.sections.filter((s) => s.columns.some((c) => c.length)) }))
    .filter((t) => t.sections.length)
}
