import { jsx, jsxs } from "react/jsx-runtime";
const plugin = ({ React, ui, store, sdk, icons }) => {
  const { useState, useMemo, useEffect } = React;
  const { BookOpen, ChevronLeft, X, Link2 } = icons;
  const useLocal = sdk.create(() => ({
    slideIdx: 0,
    activeTermId: null,
    connectionAnswer: null,
    connectionRevealed: false
  }));
  const helpers = () => {
    var _a;
    return (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers;
  };
  const toMap = (extra = {}) => {
    var _a, _b;
    return (_b = (_a = helpers()) == null ? void 0 : _a.nav) == null ? void 0 : _b.toMap(extra);
  };
  const buildTerms = (lexEntries) => lexEntries.map((lex) => {
    const formsRaw = String(lex.data.forms || "");
    let forms = [];
    if (formsRaw) {
      try {
        const parsed = JSON.parse(formsRaw);
        if (Array.isArray(parsed)) forms = parsed.map(String);
      } catch {
      }
    }
    return { id: lex.id, term: String(lex.data.term), forms };
  });
  const goToLoader = (name) => {
    if (name) sdk.log(`Termin "${name}" niezaładowany — sprawdź dostępne paczki`, "info");
    sdk.useHostStore.setState({ activeId: "plugin-bq-loader" });
  };
  const splitSlides = (texts) => {
    const joined = texts.join("\n\n");
    if (!joined.trim()) return [];
    if (/\n#{2,3}\s/.test("\n" + joined)) {
      return ("\n" + joined).split(/\n(?=#{2,3}\s)/).map((s) => s.trim()).filter(Boolean);
    }
    const paras = joined.split(/\n\n+/).filter(Boolean);
    const slides = [];
    let current = "";
    for (const p of paras) {
      if (current && current.length + p.length > 800) {
        slides.push(current.trim());
        current = p;
      } else current += (current ? "\n\n" : "") + p;
    }
    if (current.trim()) slides.push(current.trim());
    return slides.length ? slides : [joined];
  };
  function TermPopover() {
    const { activeTermId } = useLocal();
    const term = store.usePost(activeTermId || "");
    if (!term || !activeTermId) return null;
    return /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "xs", children: [
      /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
        /* @__PURE__ */ jsx(ui.Text, { size: "sm", bold: true, children: String(term.data.term) }),
        /* @__PURE__ */ jsx(ui.Button, { size: "xs", color: "ghost", onClick: () => useLocal.setState({ activeTermId: null }), children: /* @__PURE__ */ jsx(X, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsx(ui.Text, { size: "sm", muted: true, children: String(term.data.definition) }),
      /* @__PURE__ */ jsx(ui.Button, { size: "xs", color: "primary", onClick: () => {
        var _a;
        (_a = helpers()) == null ? void 0 : _a.discover(activeTermId);
        sdk.log(`Odkryto: ${term.data.term}`, "ok");
      }, children: "Odkryj" })
    ] }) });
  }
  function buildConnections(treeId, postId, nodeTitle, terms, nodes, nidMap) {
    const node = store.get(postId);
    if (!node) return [];
    const currentNodeId = String(node.data.nodeId);
    const myTerms = terms.filter((t) => (nidMap.get(t.id) || []).includes(currentNodeId));
    const candidates = [];
    for (const term of myTerms) {
      const tNodes = nidMap.get(term.id) || [];
      for (const otherNid of tNodes) {
        if (otherNid === currentNodeId) continue;
        const otherNode = nodes.find((n) => String(n.data.nodeId) === otherNid);
        if (otherNode) candidates.push({ nodeRec: otherNode, term });
        else sdk.log(`Connection challenge skip: "${term.data.term}" → nieznany node "${otherNid}"`, "error");
      }
    }
    if (!candidates.length) return [];
    const seen = /* @__PURE__ */ new Set();
    const best = [];
    for (const c of candidates) {
      if (seen.has(c.nodeRec.id)) continue;
      seen.add(c.nodeRec.id);
      best.push(c);
      if (best.length >= 2) break;
    }
    const challenges = [];
    for (const { nodeRec: correct, term: linkTerm } of best) {
      const termName = String(linkTerm.data.term);
      const wrong = nodes.filter((n) => n.id !== postId && n.id !== correct.id).sort(() => Math.random() - 0.5).slice(0, 2);
      const options = [correct, ...wrong].map((n) => ({ id: n.id, title: String(n.data.title) })).sort(() => Math.random() - 0.5);
      if (options.length < 2) continue;
      challenges.push({
        termId: linkTerm.id,
        contextTitle: termName,
        contextType: String(correct.data.branch || ""),
        currentNodeTitle: nodeTitle,
        currentNid: currentNodeId,
        correctNodeId: correct.id,
        correctNid: String(correct.data.nodeId),
        correctNodeTitle: String(correct.data.title),
        correctBranch: String(correct.data.branch || ""),
        options
      });
    }
    return challenges;
  }
  function ConnectionScreen({ challenge }) {
    const { connectionAnswer, connectionRevealed } = useLocal();
    const isCorrect = connectionAnswer === challenge.correctNodeId;
    return /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "md", children: [
      /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
        /* @__PURE__ */ jsx(Link2, { size: 18 }),
        /* @__PURE__ */ jsx(ui.Text, { bold: true, children: "Połącz konteksty" })
      ] }),
      /* @__PURE__ */ jsx(ui.Card, { color: "warning", children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "sm", children: [
        /* @__PURE__ */ jsxs(ui.Text, { size: "sm", children: [
          "W ",
          /* @__PURE__ */ jsx("strong", { children: challenge.currentNodeTitle }),
          " pojawia się ",
          /* @__PURE__ */ jsx("strong", { children: challenge.contextTitle }),
          "."
        ] }),
        /* @__PURE__ */ jsxs(ui.Text, { size: "sm", bold: true, children: [
          "Gdzie jeszcze spotkasz ",
          /* @__PURE__ */ jsx("strong", { children: challenge.contextTitle }),
          "?"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(ui.Stack, { gap: "sm", children: challenge.options.map((opt) => {
        const selected = connectionAnswer === opt.id;
        const correct = opt.id === challenge.correctNodeId;
        let color;
        if (connectionRevealed) {
          color = correct ? "success" : selected ? "error" : void 0;
        } else if (selected) {
          color = "primary";
        }
        return /* @__PURE__ */ jsxs(
          ui.Button,
          {
            block: true,
            outline: !selected || connectionRevealed && !correct,
            color,
            onClick: () => {
              var _a;
              if (connectionRevealed) return;
              useLocal.setState({ connectionAnswer: opt.id, connectionRevealed: true });
              if (opt.id === challenge.correctNodeId) {
                (_a = helpers()) == null ? void 0 : _a.discover(challenge.termId);
              }
            },
            children: [
              opt.title,
              connectionRevealed && correct && " ✓"
            ]
          },
          opt.id
        );
      }) }),
      connectionRevealed && /* @__PURE__ */ jsx(ui.Card, { color: isCorrect ? "success" : "error", children: /* @__PURE__ */ jsxs(ui.Stack, { gap: "sm", children: [
        /* @__PURE__ */ jsx(ui.Text, { size: "sm", children: isCorrect ? `Tak! ${challenge.contextTitle} łączy ${challenge.currentNodeTitle} z ${challenge.correctNodeTitle}.` : `${challenge.contextTitle} pojawia się też w ${challenge.correctNodeTitle}. Odkryłeś nowe połączenie!` }),
        /* @__PURE__ */ jsx(ui.Button, { size: "sm", color: isCorrect ? "primary" : "neutral", outline: true, onClick: () => {
          sdk.shared.setState({ bqFlash: { fromNid: challenge.currentNid, toNid: challenge.correctNid } });
          toMap();
        }, children: "Zobacz na mapie" })
      ] }) })
    ] }) });
  }
  function SlideReader() {
    const bq = sdk.shared((s) => s == null ? void 0 : s.bq);
    const treeId = (bq == null ? void 0 : bq.treeId) || "";
    const postId = (bq == null ? void 0 : bq.postId) || "";
    const nodeId = (bq == null ? void 0 : bq.nodeId) || "";
    const { slideIdx, connectionRevealed } = useLocal();
    useEffect(() => {
      useLocal.setState({ slideIdx: 0, activeTermId: null, connectionAnswer: null, connectionRevealed: false });
    }, [postId]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
      if (!treeId || !nodeId) return;
      const h = helpers();
      if (h == null ? void 0 : h.loadNodeContent) {
        setLoading(true);
        h.loadNodeContent(treeId, nodeId).finally(() => setLoading(false));
      }
    }, [treeId, nodeId]);
    const node = store.usePost(postId);
    const nodeContents = store.useChildren(postId, "content");
    const lexicon = store.useChildren(treeId, "lexicon");
    const nodes = store.useChildren(treeId, "node");
    const { nidMap } = helpers().useLexMaps();
    const nodeLexicon = useMemo(() => lexicon.filter((lex) => (nidMap.get(lex.id) || []).includes(nodeId)), [lexicon, nodeId, nidMap]);
    const slides = useMemo(() => {
      const texts = nodeContents.filter((c) => String(c.data.contentType) !== "quiz").map((c) => String(c.data.text));
      return splitSlides(texts);
    }, [nodeContents]);
    const quizzes = useMemo(
      () => nodeContents.filter((c) => String(c.data.contentType) === "quiz"),
      [nodeContents]
    );
    const steps = useMemo(() => {
      const nodeTitle = node ? String(node.data.title) : "";
      const connections = treeId && postId ? buildConnections(treeId, postId, nodeTitle, lexicon, nodes, nidMap) : [];
      const seq = [];
      for (const s of slides) seq.push({ kind: "slide", text: s });
      if (quizzes.length) seq.push({ kind: "quiz" });
      for (const c of connections) seq.push({ kind: "connection", challenge: c });
      return seq;
    }, [slides, quizzes.length, node, treeId, postId, lexicon, nodes, nidMap]);
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Otwórz BrainQuest i wybierz węzeł" });
    if (!postId || !node) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Kliknij węzeł w drzewie wiedzy" });
    if (loading) return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsx(ui.Spinner, {}),
      /* @__PURE__ */ jsx(ui.Text, { muted: true, size: "sm", children: "Ładowanie treści..." })
    ] }) });
    if (!steps.length) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Brak treści dla tego węzła" });
    const safeIdx = Math.min(slideIdx, steps.length - 1);
    const step = steps[safeIdx];
    const isConnection = step.kind === "connection";
    const goBack = () => toMap();
    const goNext = () => useLocal.setState({
      slideIdx: safeIdx + 1,
      activeTermId: null,
      connectionAnswer: null,
      connectionRevealed: false
    });
    const goPrev = () => useLocal.setState({
      slideIdx: safeIdx - 1,
      activeTermId: null,
      connectionAnswer: null,
      connectionRevealed: false
    });
    const canAdvance = !isConnection || connectionRevealed;
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsx(ui.Stage, { children: /* @__PURE__ */ jsx(
      ui.StageLayout,
      {
        top: /* @__PURE__ */ jsxs(ui.Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(ui.StepHeading, { step: `${safeIdx + 1}`, title: String(node.data.title), subtitle: `${safeIdx + 1} / ${steps.length}` }),
          step.kind === "slide" && /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsx(ui.Stack, { children: /* @__PURE__ */ jsx(ui.Markdown, { text: step.text, terms: buildTerms(nodeLexicon), onTermClick: (id) => useLocal.setState({ activeTermId: id }), onMissingTermClick: goToLoader }) }) }),
          step.kind === "connection" && /* @__PURE__ */ jsx(ConnectionScreen, { challenge: step.challenge }),
          step.kind === "quiz" && /* @__PURE__ */ jsxs(ui.Stack, { children: [
            /* @__PURE__ */ jsx(ui.Text, { bold: true, children: "Quiz" }),
            quizzes.map((q) => /* @__PURE__ */ jsx(QuizCard, { quiz: q, terms: buildTerms(nodeLexicon) }, q.id))
          ] }),
          /* @__PURE__ */ jsx(TermPopover, {})
        ] }),
        bottom: /* @__PURE__ */ jsxs(ui.Stack, { children: [
          safeIdx < steps.length - 1 ? /* @__PURE__ */ jsx(ui.Button, { size: "lg", color: "primary", block: true, disabled: !canAdvance, onClick: goNext, children: isConnection && !connectionRevealed ? "Odpowiedz, by kontynuować" : "Dalej" }) : /* @__PURE__ */ jsx(ui.Button, { size: "lg", color: "primary", block: true, onClick: goBack, children: "Wróć do mapy" }),
          safeIdx > 0 && /* @__PURE__ */ jsx(ui.Button, { size: "lg", outline: true, block: true, onClick: goPrev, children: "Wstecz" })
        ] })
      }
    ) }) });
  }
  function QuizCard({ quiz, terms }) {
    const [show, setShow] = useState(false);
    const onTermClick = (id) => useLocal.setState({ activeTermId: id });
    return /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsx(ui.Markdown, { text: String(quiz.data.text), terms, onTermClick, className: "font-bold" }),
      show ? /* @__PURE__ */ jsx(ui.Markdown, { text: String(quiz.data.answer), terms, onTermClick }) : /* @__PURE__ */ jsx(ui.Button, { size: "xs", outline: true, onClick: () => setShow(true), children: "Pokaż odpowiedź" })
    ] }) });
  }
  function LeftPanel() {
    var _a, _b;
    const bq = sdk.shared((s) => s == null ? void 0 : s.bq);
    const treeId = (bq == null ? void 0 : bq.treeId) || "";
    const nodeId = (bq == null ? void 0 : bq.nodeId) || "";
    const lexicon = store.useChildren(treeId, "lexicon");
    const { nidMap } = helpers().useLexMaps();
    const Shared = (_b = (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers) == null ? void 0 : _b.CheatSheet;
    if (!Shared) return null;
    const nodeTermIds = useMemo(() => {
      const s = /* @__PURE__ */ new Set();
      for (const l of lexicon) {
        if ((nidMap.get(l.id) || []).includes(nodeId)) s.add(l.id);
      }
      return s;
    }, [lexicon, nodeId, nidMap]);
    return /* @__PURE__ */ jsx(
      Shared,
      {
        filter: (id) => nodeTermIds.has(id),
        onBack: () => toMap(),
        backIcon: ChevronLeft
      }
    );
  }
  const SharedProgress = () => {
    var _a, _b;
    const P = (_b = (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers) == null ? void 0 : _b.Progress;
    return P ? /* @__PURE__ */ jsx(P, {}) : null;
  };
  sdk.registerView("bqr.left", { slot: "left", component: LeftPanel });
  sdk.registerView("bqr.center", { slot: "center", component: SlideReader });
  sdk.registerView("bqr.right", { slot: "right", component: SharedProgress });
  return { id: "plugin-brain-quest-reader", label: "BQ Czytnik", icon: BookOpen, version: "0.4.0" };
};
export {
  plugin as default
};
