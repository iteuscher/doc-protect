"""Shared helpers for thesis chart scripts."""
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

CHARTS_DIR = Path(__file__).resolve().parent
CSV_PATH = CHARTS_DIR / 'Codebook for Thesis - Raw Scored.csv'

COLORS = {
    'password_based': '#A9A9A9',
    'passwordless': '#56B4E9',
    'negative': '#a63636',
    'marginal': '#a67c00',
    'positive': '#2c7a2c',
}


def load_thesis_df() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    for col in ['ΔSUS', 'VU A', 'VU D', 'VS A', 'VS D']:
        df[col] = df[col].astype(str).str.replace('−', '-').astype(float)
    return df


def save_figure(fig: plt.Figure, stem: str) -> None:
    path = CHARTS_DIR / stem
    fig.savefig(f'{path}.pdf', dpi=300, bbox_inches='tight')
    fig.savefig(f'{path}.svg', bbox_inches='tight')


def add_zone_labels(
    ax,
    labels: list[tuple[float, str, str]],
    *,
    y: float = 1.04,
    fontsize: int = 10,
) -> None:
    """Place interpretation labels above the plot (data-x, axes-y > 1)."""
    trans = ax.get_xaxis_transform()
    for x, text, color in labels:
        ax.text(
            x, y, text, transform=trans, ha='center', va='bottom',
            color=color, fontsize=fontsize, fontweight='bold', clip_on=False,
        )


def finalize_zone_violin_figure(
    fig: plt.Figure,
    ax,
    zone_labels: list[tuple[float, str, str]],
    xlabel: str,
) -> None:
    """Reserve top margin for zone labels, then label axes."""
    fig.subplots_adjust(top=0.88, bottom=0.12, left=0.10, right=0.96)
    ax.set_xlabel(xlabel, fontsize=11)
    ax.set_ylabel('')
    add_zone_labels(ax, zone_labels)
