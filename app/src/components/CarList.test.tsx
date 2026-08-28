import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import scripted from '../../public/trajectories/scripted-track_a.trajectory.json';
import { parseTrajectory } from '../engine/schema';
import { selectPrimary, useTransport } from '../store/transport';
import { CarList } from './CarList';

const tr = (() => {
  const r = parseTrajectory(scripted);
  if (!r.ok) throw new Error(r.error);
  return r.trajectory;
})();

beforeEach(() => useTransport.setState({ cars: [], focusIndex: 0, track: null }));

describe('CarList', () => {
  it('renders nothing with no cars', () => {
    const { container } = render(<CarList />);
    expect(container).toBeEmptyDOMElement();
  });
  it('lists cars, focuses on click, removes ghosts', async () => {
    useTransport.getState().setTrajectory(tr, 'A');
    useTransport.getState().addGhost(tr, 'B');
    render(<CarList />);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(selectPrimary(useTransport.getState())?.label).toBe('B');
    await userEvent.click(screen.getByRole('button', { name: 'remove A' }));
    expect(useTransport.getState().cars.map((c) => c.label)).toEqual(['B']);
  });
});
