import { createRoot } from 'react-dom/client';
import type { ToolId } from './core/types';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles.css';
import './theme.css';
import './ui-polish.css';
const query = new URLSearchParams(location.search),
  tool = query.get('instrument');
createRoot(document.getElementById('root')!).render(
  <App
    initialDatasetUrl={query.get('dataset') ?? undefined}
    instrument={
      tool && ['space', 'transform', 'compose', 'rank', 'uncertainty'].includes(tool)
        ? (tool as ToolId)
        : undefined
    }
  />,
);
