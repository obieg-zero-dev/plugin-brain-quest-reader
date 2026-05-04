import type { PluginFactory, PostRecord } from '@obieg-zero/sdk'

const plugin: PluginFactory = ({ React, ui, store, sdk, icons }) => {
  const { useState, useMemo, useEffect } = React
  const { BookOpen, ChevronLeft, X, Link2 } = icons

  const useLocal = sdk.create(() => ({
    slideIdx: 0,
    activeTermId: null as string | null,
    connectionAnswer: null as string | null,
    connectionRevealed: false,
  }))

  type LexMaps = { nidMap: Map<string, string[]>; quizMap: Map<string, PostRecord> }
  const helpers = () => (sdk.shared.getState() as any)?.bqHelpers as {
    discover: (id: string) => void
    edgeStr: (d: PostRecord) => number
    loadNodeContent?: (treeId: string, nodeId: string) => Promise<void>
    useLexMaps: () => LexMaps
    nav?: { toMap: (extra?: any) => void; toReader: (extra?: any) => void; toArena: (extra?: any) => void }
  } | undefined
  const toMap = (extra: any = {}) => helpers()?.nav?.toMap(extra)

  const buildTerms = (lexEntries: PostRecord[]) =>
    lexEntries.map(lex => ({ id: lex.id, term: String(lex.data.term) }))

  // --- slajdy ---
  const splitSlides = (texts: string[]): string[] => {
    const joined = texts.join('\n\n')
    if (!joined.trim()) return []
    if (/\n#{2,3}\s/.test('\n' + joined)) {
      return ('\n' + joined).split(/\n(?=#{2,3}\s)/).map(s => s.trim()).filter(Boolean)
    }
    const paras = joined.split(/\n\n+/).filter(Boolean)
    const slides: string[] = []
    let current = ''
    for (const p of paras) {
      if (current && current.length + p.length > 800) { slides.push(current.trim()); current = p }
      else current += (current ? '\n\n' : '') + p
    }
    if (current.trim()) slides.push(current.trim())
    return slides.length ? slides : [joined]
  }

  function TermPopover() {
    const { activeTermId } = useLocal()
    const term = store.usePost(activeTermId || '')

    if (!term || !activeTermId) return null

    return (
      <ui.Card><ui.Stack gap="xs">
        <ui.Row justify="between">
          <ui.Text size="sm" bold>{String(term.data.term)}</ui.Text>
          <ui.Button size="xs" color="ghost" onClick={() => useLocal.setState({ activeTermId: null })}><X size={16} /></ui.Button>
        </ui.Row>
        <ui.Text size="sm" muted>{String(term.data.definition)}</ui.Text>
        <ui.Button size="xs" color="primary" onClick={() => { helpers()?.discover(activeTermId); sdk.log(`Odkryto: ${term.data.term}`, 'ok') }}>
          Odkryj
        </ui.Button>
      </ui.Stack></ui.Card>
    )
  }

  // --- Connection challenges (from term.nodes) ---
  type ConnectionChallenge = {
    termId: string
    contextTitle: string
    contextType: string
    currentNodeTitle: string
    currentNid: string
    correctNodeId: string
    correctNid: string
    correctNodeTitle: string
    correctBranch: string
    options: { id: string; title: string }[]
  }

  function buildConnections(
    treeId: string, postId: string, nodeTitle: string,
    terms: PostRecord[], nodes: PostRecord[], nidMap: Map<string, string[]>
  ): ConnectionChallenge[] {
    const node = store.get(postId)
    if (!node) return []
    const currentNodeId = String(node.data.nodeId)

    // Terminy z bieżącego węzła (explicit z term.nodes)
    const myTerms = terms.filter(t => (nidMap.get(t.id) || []).includes(currentNodeId))

    // Szukaj terminów z 2+ nodes które łączą bieżący węzeł z innymi
    const candidates: { nodeRec: PostRecord; term: PostRecord }[] = []
    for (const term of myTerms) {
      const tNodes = nidMap.get(term.id) || []
      for (const otherNid of tNodes) {
        if (otherNid === currentNodeId) continue
        const otherNode = nodes.find(n => String(n.data.nodeId) === otherNid)
        if (otherNode) candidates.push({ nodeRec: otherNode, term })
        else sdk.log(`Connection challenge skip: "${term.data.term}" → nieznany node "${otherNid}"`, 'error')
      }
    }

    if (!candidates.length) return []

    // Deduplikuj po węźle docelowym, weź najlepsze 2
    const seen = new Set<string>()
    const best: typeof candidates = []
    for (const c of candidates) {
      if (seen.has(c.nodeRec.id)) continue
      seen.add(c.nodeRec.id)
      best.push(c)
      if (best.length >= 2) break
    }

    const challenges: ConnectionChallenge[] = []
    for (const { nodeRec: correct, term: linkTerm } of best) {
      const termName = String(linkTerm.data.term)
      const wrong = nodes.filter(n => n.id !== postId && n.id !== correct.id)
        .sort(() => Math.random() - 0.5).slice(0, 2)
      const options = [correct, ...wrong]
        .map(n => ({ id: n.id, title: String(n.data.title) }))
        .sort(() => Math.random() - 0.5)
      if (options.length < 2) continue
      challenges.push({
        termId: linkTerm.id,
        contextTitle: termName,
        contextType: String(correct.data.branch || ''),
        currentNodeTitle: nodeTitle,
        currentNid: currentNodeId,
        correctNodeId: correct.id,
        correctNid: String(correct.data.nodeId),
        correctNodeTitle: String(correct.data.title),
        correctBranch: String(correct.data.branch || ''),
        options,
      })
    }
    return challenges
  }

  function ConnectionScreen({ challenge }: { challenge: ConnectionChallenge }) {
    const { connectionAnswer, connectionRevealed } = useLocal()
    const isCorrect = connectionAnswer === challenge.correctNodeId

    return (
      <ui.Card>
        <ui.Stack gap="md">
          <ui.Row gap="sm">
            <Link2 size={18} />
            <ui.Text bold>Połącz konteksty</ui.Text>
          </ui.Row>

          <ui.Card color="warning"><ui.Stack gap="sm">
            <ui.Text size="sm">
              W <strong>{challenge.currentNodeTitle}</strong> pojawia się <strong>{challenge.contextTitle}</strong>.
            </ui.Text>
            <ui.Text size="sm" bold>
              Gdzie jeszcze spotkasz <strong>{challenge.contextTitle}</strong>?
            </ui.Text>
          </ui.Stack></ui.Card>

          <ui.Stack gap="sm">
            {challenge.options.map(opt => {
              const selected = connectionAnswer === opt.id
              const correct = opt.id === challenge.correctNodeId
              let color: 'primary' | 'success' | 'error' | undefined
              if (connectionRevealed) {
                color = correct ? 'success' : selected ? 'error' : undefined
              } else if (selected) {
                color = 'primary'
              }

              return (
                <ui.Button
                  key={opt.id}
                  block
                  outline={!selected || (connectionRevealed && !correct)}
                  color={color}
                  onClick={() => {
                    if (connectionRevealed) return
                    useLocal.setState({ connectionAnswer: opt.id, connectionRevealed: true })
                    if (opt.id === challenge.correctNodeId) {
                      helpers()?.discover(challenge.termId)
                    }
                  }}
                >
                  {opt.title}
                  {connectionRevealed && correct && ' ✓'}
                </ui.Button>
              )
            })}
          </ui.Stack>

          {connectionRevealed && (
            <ui.Card color={isCorrect ? 'success' : 'error'}><ui.Stack gap="sm">
              <ui.Text size="sm">
                {isCorrect
                  ? `Tak! ${challenge.contextTitle} łączy ${challenge.currentNodeTitle} z ${challenge.correctNodeTitle}.`
                  : `${challenge.contextTitle} pojawia się też w ${challenge.correctNodeTitle}. Odkryłeś nowe połączenie!`}
              </ui.Text>
              <ui.Button size="sm" color={isCorrect ? 'primary' : 'neutral'} outline onClick={() => {
                sdk.shared.setState({ bqFlash: { fromNid: challenge.currentNid, toNid: challenge.correctNid } })
                toMap()
              }}>Zobacz na mapie</ui.Button>
            </ui.Stack></ui.Card>
          )}
        </ui.Stack>
      </ui.Card>
    )
  }

  // --- SlideReader (center) ---
  type Step = { kind: 'slide'; text: string } | { kind: 'connection'; challenge: ConnectionChallenge } | { kind: 'quiz' }

  function SlideReader() {
    const bq = sdk.shared(s => (s as any)?.bq) as { treeId?: string; postId?: string; nodeId?: string } | undefined
    const treeId = bq?.treeId || ''
    const postId = bq?.postId || ''
    const nodeId = bq?.nodeId || ''
    const { slideIdx, connectionRevealed } = useLocal()

    // Reset slideIdx przy zmianie węzła
    useEffect(() => {
      useLocal.setState({ slideIdx: 0, activeTermId: null, connectionAnswer: null, connectionRevealed: false })
    }, [postId])

    // Lazy load content z GitHub
    const [loading, setLoading] = useState(false)
    useEffect(() => {
      if (!treeId || !nodeId) return
      const h = helpers()
      if (h?.loadNodeContent) {
        setLoading(true)
        h.loadNodeContent(treeId, nodeId).finally(() => setLoading(false))
      }
    }, [treeId, nodeId])

    const node = store.usePost(postId)
    const nodeContents = store.useChildren(postId, 'content') as PostRecord[]
    const lexicon = store.useChildren(treeId, 'lexicon') as PostRecord[]
    const nodes = store.useChildren(treeId, 'node') as PostRecord[]
    const { nidMap } = helpers()!.useLexMaps()

    const nodeLexicon = useMemo(() => lexicon.filter(lex => (nidMap.get(lex.id) || []).includes(nodeId)), [lexicon, nodeId, nidMap])

    const slides = useMemo(() => {
      const texts = nodeContents.filter(c => String(c.data.contentType) !== 'quiz').map(c => String(c.data.text))
      return splitSlides(texts)
    }, [nodeContents])

    const quizzes = useMemo(() =>
      nodeContents.filter(c => String(c.data.contentType) === 'quiz'),
    [nodeContents])

    // Buduj sekwencję: slajdy → połączenia → quiz
    const steps = useMemo<Step[]>(() => {
      const nodeTitle = node ? String(node.data.title) : ''
      const connections = treeId && postId
        ? buildConnections(treeId, postId, nodeTitle, lexicon, nodes, nidMap)
        : []

      const seq: Step[] = []
      for (const s of slides) seq.push({ kind: 'slide', text: s })
      if (quizzes.length) seq.push({ kind: 'quiz' })
      for (const c of connections) seq.push({ kind: 'connection', challenge: c })
      return seq
    }, [slides, quizzes.length, node, treeId, postId, lexicon, nodes, nidMap])

    if (!treeId) return <ui.Placeholder text="Otwórz BrainQuest i wybierz węzeł" />
    if (!postId || !node) return <ui.Placeholder text="Kliknij węzeł w drzewie wiedzy" />
    if (loading) return <ui.Page><ui.Stack><ui.Spinner /><ui.Text muted size="sm">Ładowanie treści...</ui.Text></ui.Stack></ui.Page>
    if (!steps.length) return <ui.Placeholder text="Brak treści dla tego węzła" />

    const safeIdx = Math.min(slideIdx, steps.length - 1)
    const step = steps[safeIdx]
    const isConnection = step.kind === 'connection'

    const goBack = () => toMap()

    const goNext = () => useLocal.setState({
      slideIdx: safeIdx + 1, activeTermId: null,
      connectionAnswer: null, connectionRevealed: false,
    })
    const goPrev = () => useLocal.setState({
      slideIdx: safeIdx - 1, activeTermId: null,
      connectionAnswer: null, connectionRevealed: false,
    })

    // na ekranie połączenia "Dalej" dopiero po odpowiedzi
    const canAdvance = !isConnection || connectionRevealed

    return (
      <ui.Page><ui.Stage><ui.StageLayout
        top={<ui.Stack gap="md">
          <ui.StepHeading step={`${safeIdx + 1}`} title={String(node.data.title)} subtitle={`${safeIdx + 1} / ${steps.length}`} />

          {step.kind === 'slide' && (
            <ui.Card><ui.Stack>
              <ui.Markdown text={step.text} terms={buildTerms(nodeLexicon)} onTermClick={(id) => useLocal.setState({ activeTermId: id })} />
            </ui.Stack></ui.Card>
          )}

          {step.kind === 'connection' && (
            <ConnectionScreen challenge={step.challenge} />
          )}

          {step.kind === 'quiz' && <ui.Stack>
            <ui.Text bold>Quiz</ui.Text>
            {quizzes.map(q => <QuizCard key={q.id} quiz={q} terms={buildTerms(nodeLexicon)} />)}
          </ui.Stack>}

          <TermPopover />
        </ui.Stack>}
        bottom={<ui.Stack>
          {safeIdx < steps.length - 1
            ? <ui.Button size="lg" color="primary" block disabled={!canAdvance} onClick={goNext}>
                {isConnection && !connectionRevealed ? 'Odpowiedz, by kontynuować' : 'Dalej'}
              </ui.Button>
            : <ui.Button size="lg" color="primary" block onClick={goBack}>
                Wróć do mapy
              </ui.Button>}
          {safeIdx > 0 && <ui.Button size="lg" outline block onClick={goPrev}>
            Wstecz
          </ui.Button>}
        </ui.Stack>}
      /></ui.Stage></ui.Page>
    )
  }

  function QuizCard({ quiz, terms }: { quiz: PostRecord; terms: { id: string; term: string }[] }) {
    const [show, setShow] = useState(false)
    const onTermClick = (id: string) => useLocal.setState({ activeTermId: id })
    return (
      <ui.Card><ui.Stack>
        <ui.Markdown text={String(quiz.data.text)} terms={terms} onTermClick={onTermClick} className="font-bold" />
        {show
          ? <ui.Markdown text={String(quiz.data.answer)} terms={terms} onTermClick={onTermClick} />
          : <ui.Button size="xs" outline onClick={() => setShow(true)}>Pokaż odpowiedź</ui.Button>}
      </ui.Stack></ui.Card>
    )
  }


  // --- LeftPanel: deleguje do shared bqHelpers.CheatSheet (filtr: termy z bieżącego węzła) ---
  function LeftPanel() {
    const bq = sdk.shared(s => (s as any)?.bq) as { treeId?: string; nodeId?: string } | undefined
    const treeId = bq?.treeId || ''
    const nodeId = bq?.nodeId || ''
    const lexicon = store.useChildren(treeId, 'lexicon') as PostRecord[]
    const { nidMap } = helpers()!.useLexMaps()
    const Shared = (sdk.shared.getState() as any)?.bqHelpers?.CheatSheet
    if (!Shared) return null

    const nodeTermIds = useMemo(() => {
      const s = new Set<string>()
      for (const l of lexicon) {
        if ((nidMap.get(l.id) || []).includes(nodeId)) s.add(l.id)
      }
      return s
    }, [lexicon, nodeId, nidMap])

    return <Shared
      filter={(id: string) => nodeTermIds.has(id)}
      onBack={() => toMap()}
      backIcon={ChevronLeft}
    />
  }

  const SharedProgress = () => { const P = (sdk.shared.getState() as any)?.bqHelpers?.Progress; return P ? <P /> : null }

  sdk.registerView('bqr.left', { slot: 'left', component: LeftPanel })
  sdk.registerView('bqr.center', { slot: 'center', component: SlideReader })
  sdk.registerView('bqr.right', { slot: 'right', component: SharedProgress })

  return { id: 'plugin-brain-quest-reader', label: 'BQ Czytnik', icon: BookOpen, version: '0.4.0' }
}
export default plugin
