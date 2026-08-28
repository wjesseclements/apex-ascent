import { act, render, screen } from '@testing-library/react';
import { App } from './App';
import { useLive } from './store/live';
import { useTransport } from './store/transport';

beforeEach(() => {
  useLive.setState({ mode: 'replay', runId: 0, status: 'idle', error: null });
  useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
});

describe('App', () => {
  it('a live deep link switches to live mode without the gallery autoloading over the live car', async () => {
    vi.stubGlobal('location', { ...window.location, search: '?mode=live' });
    render(<App autoload={true} />);
    await act(async () => {});
    expect(useLive.getState().mode).toBe('live');
    expect(screen.getByRole('img', { name: 'live drive' })).toBeInTheDocument();
    expect(useTransport.getState().cars).toHaveLength(0); // no landing state loaded
  });
  it('renders the replay layout without autoloading in tests', () => {
    useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
    render(<App autoload={false} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Watch the policy drive.');
    expect(screen.getByRole('img', { name: 'track replay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /on its training track/ })).toBeInTheDocument();
    expect(screen.getByText(/Loading gallery/)).toBeInTheDocument();
    expect(screen.getByLabelText('open trajectory file')).toBeInTheDocument();
  });
});
