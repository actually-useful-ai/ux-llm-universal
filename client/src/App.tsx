import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Router, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ProviderProvider } from "./contexts/ProviderContext";
import { ToolProvider } from "./contexts/ToolContext";
import { ConversationProvider } from "./contexts/ConversationContext";
import { JobProvider } from "./contexts/JobContext";
import { ArtifactProvider } from "./contexts/ArtifactContext";
import { OfflineQueueProvider } from "./contexts/OfflineQueueContext";
import { PromptChainProvider } from "./contexts/PromptChainContext";
import AppShell from "./components/AppShell";

// Lazy-loaded pages
const ConversePage = lazy(() => import("./pages/ConversePage"));
const CreatePage = lazy(() => import("./pages/CreatePage"));
const ResearchPage = lazy(() => import("./pages/ResearchPage"));
const EvaluatePage = lazy(() => import("./pages/EvaluatePage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));
const VoicePage = lazy(() => import("./pages/VoicePage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const CollectionsPage = lazy(() => import("./pages/CollectionsPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const ModelsPage = lazy(() => import("./pages/ModelsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const TokenizerPage = lazy(() => import("./pages/TokenizerPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") || "";

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function AppRouter() {
  return (
    <Router base={BASE}>
      <AppShell>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={ConversePage} />
            <Route path="/create" component={CreatePage} />
            <Route path="/research" component={ResearchPage} />
            <Route path="/research/:taskId" component={ResearchPage} />
            <Route path="/evaluate" component={EvaluatePage} />
            <Route path="/voice" component={VoicePage} />
            <Route path="/favorites" component={FavoritesPage} />
            <Route path="/templates" component={TemplatesPage} />
            <Route path="/models" component={ModelsPage} />
            <Route path="/analytics" component={AnalyticsPage} />
            <Route path="/tokenizer" component={TokenizerPage} />
            <Route path="/gallery/collections" component={CollectionsPage} />
            <Route path="/gallery" component={GalleryPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppShell>
    </Router>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SettingsProvider>
          <ProviderProvider>
            <TooltipProvider>
              <ToolProvider>
                <ConversationProvider>
                  <JobProvider>
                    <ArtifactProvider>
                      <OfflineQueueProvider>
                        <PromptChainProvider>
                          <Toaster />
                          <AppRouter />
                        </PromptChainProvider>
                      </OfflineQueueProvider>
                    </ArtifactProvider>
                  </JobProvider>
                </ConversationProvider>
              </ToolProvider>
            </TooltipProvider>
          </ProviderProvider>
        </SettingsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
