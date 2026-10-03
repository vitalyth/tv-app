import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QualityDialog } from '../src/components/player/QualityDialog';

describe('QualityDialog', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('shows the active automatic quality without guessing', async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QualityDialog
          qualities={[
            { id: 'auto', label: 'Auto' },
            { id: '1080', label: '1080p', height: 1080, active: true },
            { id: '720', label: '720p', height: 720 },
          ]}
          selectedQualityId="auto"
          onSelectQuality={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const textNodes = renderer.root.findAllByType('Text' as any);
    const textContents = textNodes.map(node => node.props.children).flat();
    expect(textContents).toContain('Auto (1080p)');
  });

  it('allows selecting the third quality option', async () => {
    const onSelectQuality = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <QualityDialog
          qualities={[
            { id: 'auto', label: 'Auto' },
            { id: '1080', label: '1080p', height: 1080 },
            { id: '720', label: '720p', height: 720 },
            { id: '480', label: '480p', height: 480 },
          ]}
          selectedQualityId="auto"
          onSelectQuality={onSelectQuality}
          onClose={onClose}
        />,
      );
    });

    await act(async () => {
      renderer.root
        .findByProps({ testID: 'quality-option-720' })
        .props.onPress();
    });

    expect(onSelectQuality).toHaveBeenCalledWith('720');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
