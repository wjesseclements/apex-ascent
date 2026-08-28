import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLive } from '../store/live';
import { LivePanel } from './LivePanel';

beforeEach(() =>
  useLive.setState({
    mode: 'live',
    trackId: 'track_a',
    modelId: 'e7-8m',
    runId: 0,
    status: 'idle',
    error: null,
    tickRate: 0,
  }),
);

describe('LivePanel', () => {
  it('picks track and model and starts a run', async () => {
    render(<LivePanel />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'live track' }), 'track_b');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'live model' }), 'e7-13m');
    await userEvent.click(screen.getByRole('button', { name: 'start' }));
    expect(useLive.getState()).toMatchObject({
      trackId: 'track_b',
      modelId: 'e7-13m',
      runId: 1,
      status: 'loading',
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the policy/);
    expect(screen.getByRole('combobox', { name: 'live track' })).toBeDisabled();
  });
  it('shows crash and error states', () => {
    useLive.setState({ status: 'crashed' });
    const { rerender } = render(<LivePanel />);
    expect(screen.getByRole('status')).toHaveTextContent(/Crashed/);
    useLive.setState({ status: 'error', error: 'HTTP 404' });
    rerender(<LivePanel />);
    expect(screen.getByRole('status')).toHaveTextContent(/Could not start. HTTP 404/);
    useLive.setState({ status: 'driving', tickRate: 60 });
    rerender(<LivePanel />);
    expect(screen.getByRole('status')).toHaveTextContent(/60 ticks\/s/);
  });
});
