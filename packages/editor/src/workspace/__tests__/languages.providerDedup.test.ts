import { describe, it, expect, vi } from 'vitest'

// Repro for the "hover doc appears 2-3× back to back" bug.
//
// `ensureWorkspaceLanguages` registers each runtime's Monaco providers once,
// guarded so mounting N editors doesn't stack N copies. The failure mode this
// file pins down: React Fast Refresh re-evaluates the `languages` module (its
// guard resets) while the real Monaco global — where the providers actually
// live — persists across the reload. If the guard is module-scoped, every HMR
// cycle re-registers, and Monaco renders every provider's hover result, so the
// same doc appears once per stacked provider.
//
// The signal we count is the `strudel` hover provider: it is registered from
// exactly one place (`registerStrudelHover`), so its count isolates the guard.

interface ProviderCapableMonaco {
  monaco: unknown
  strudelHoverCount: () => number
}

function makeProviderCapableMonaco(): ProviderCapableMonaco {
  const hoverRegistrations: string[] = []
  const langs: Array<{ id: string }> = []
  const disposable = { dispose() {} }
  const monaco = {
    languages: {
      register: (l: { id: string }) => {
        if (!langs.some((x) => x.id === l.id)) langs.push(l)
      },
      getLanguages: () => langs.slice(),
      setMonarchTokensProvider: () => disposable,
      setLanguageConfiguration: () => disposable,
      registerHoverProvider: (lang: string) => {
        hoverRegistrations.push(lang)
        return disposable
      },
      registerCompletionItemProvider: () => disposable,
      registerFoldingRangeProvider: () => disposable,
      registerCodeActionProvider: () => disposable,
      CompletionItemKind: new Proxy({}, { get: () => 1 }),
    },
    Range: class {
      constructor(..._args: unknown[]) {}
    },
  }
  return {
    monaco,
    strudelHoverCount: () => hoverRegistrations.filter((l) => l === 'strudel').length,
  }
}

describe('ensureWorkspaceLanguages — provider registration is idempotent per Monaco', () => {
  it('does not stack a second strudel hover provider across a module re-eval (HMR) on the same Monaco', async () => {
    const { monaco, strudelHoverCount } = makeProviderCapableMonaco()

    vi.resetModules()
    const gen1 = await import('../languages')
    gen1.ensureWorkspaceLanguages(monaco as never)

    // Simulate React Fast Refresh: the languages module re-evaluates (its
    // module-level guard, if any, resets), but the same Monaco global is
    // reused — the providers registered in gen1 are still live.
    vi.resetModules()
    const gen2 = await import('../languages')
    gen2.ensureWorkspaceLanguages(monaco as never)

    expect(strudelHoverCount()).toBe(1)
  })

  it('is idempotent when called repeatedly within one module generation (N-editor mount)', async () => {
    const { monaco, strudelHoverCount } = makeProviderCapableMonaco()

    vi.resetModules()
    const mod = await import('../languages')
    mod.ensureWorkspaceLanguages(monaco as never)
    mod.ensureWorkspaceLanguages(monaco as never)
    mod.ensureWorkspaceLanguages(monaco as never)

    expect(strudelHoverCount()).toBe(1)
  })
})
