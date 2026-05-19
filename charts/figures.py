"""
DocProtect Thesis Figures
Outputs PDF + SVG for each figure.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from matplotlib.patches import Patch

from plot_utils import COLORS, add_zone_labels, load_thesis_df, save_figure

CHARTS_DIR = Path(__file__).resolve().parent
df = load_thesis_df()
sns.set_theme(style='whitegrid')

# ═══════════════════════════════════════════════════════════════════════════
# FIGURE 1: VdL Grouped Bar Chart (Usefulness & Satisfaction)
# ═══════════════════════════════════════════════════════════════════════════

fig, ax = plt.subplots(figsize=(7, 5.5))

measures = ['Usefulness', 'Satisfaction']
adobe_means = [df['VU A'].mean(), df['VS A'].mean()]
dp_means = [df['VU D'].mean(), df['VS D'].mean()]
adobe_sds = [df['VU A'].std(ddof=1), df['VS A'].std(ddof=1)]
dp_sds = [df['VU D'].std(ddof=1), df['VS D'].std(ddof=1)]
n = len(df)
adobe_ses = [s / np.sqrt(n) for s in adobe_sds]
dp_ses = [s / np.sqrt(n) for s in dp_sds]

x = np.arange(len(measures))
width = 0.32

bars1 = ax.bar(
    x - width / 2, adobe_means, width, yerr=adobe_ses, capsize=4,
    label='Password-based', color=COLORS['password_based'], edgecolor='white', zorder=2,
)
bars2 = ax.bar(
    x + width / 2, dp_means, width, yerr=dp_ses, capsize=4,
    label='Passwordless', color=COLORS['passwordless'], edgecolor='white', zorder=2,
)

label_offset = 0.07
for bar, mean, err in zip(bars1, adobe_means, adobe_ses):
    ax.text(
        bar.get_x() + bar.get_width() / 2, mean + err + label_offset,
        f'{mean:+.2f}', ha='center', va='bottom', fontsize=9, color='#555',
    )
for bar, mean, err in zip(bars2, dp_means, dp_ses):
    ax.text(
        bar.get_x() + bar.get_width() / 2, mean + err + label_offset,
        f'{mean:+.2f}', ha='center', va='bottom', fontsize=9, color='#555',
    )

bracket_y = max(dp_means[0] + dp_ses[0], adobe_means[0] + adobe_ses[0]) + 0.28
ax.plot(
    [x[0] - width / 2, x[0] - width / 2, x[0] + width / 2, x[0] + width / 2],
    [bracket_y - 0.04, bracket_y, bracket_y, bracket_y - 0.04],
    color='black', linewidth=1, zorder=3,
)
ax.text(x[0], bracket_y + 0.05, '*', ha='center', va='bottom', fontsize=13, fontweight='bold')

ax.set_ylabel('Van der Laan Score', fontsize=11)
ax.set_xticks(x)
ax.set_xticklabels(measures, fontsize=11)
ax.set_ylim(-2, 2)
ax.axhline(0, color='gray', linewidth=0.8, linestyle='-', alpha=0.5)
ax.legend(fontsize=10, loc='lower right', framealpha=0.95)

fig.tight_layout()
save_figure(fig, 'VdL_Acceptance_Bar')
plt.close()
print('✓ VdL bar chart saved')


# ═══════════════════════════════════════════════════════════════════════════
# FIGURE 2: ATI vs SUS — side-by-side panels (password-based & passwordless)
# ═══════════════════════════════════════════════════════════════════════════

# (sus_col, y-label, dot_color, annotation, line_color, bold_annot, label_points)
_ATI_PANELS = [
    ('SUS A', 'Password-based SUS Score', '#7a7a7a',
     r'$\rho = +.192,\ p = .405$', '#888888', False, False),
    ('SUS D', 'Passwordless SUS Score',   '#1a7fbf',
     r'$\rho = +.578,\ p = .006$*', '#E05050', True, False),
]

fig, axes = plt.subplots(1, 2, figsize=(12, 5.5), sharey=True)
fig.subplots_adjust(wspace=0.12)

for ax, (sus_col, ylabel, dot_color, annot, line_color, bold_annot, label_pts) in zip(axes, _ATI_PANELS):
    mask = df['ATI'].notna() & df[sus_col].notna()
    x_data = df.loc[mask, 'ATI']
    y_data = df.loc[mask, sus_col]

    ax.scatter(x_data, y_data, s=70, color=dot_color,
               edgecolor='white', linewidth=0.8, zorder=3, alpha=1.0)

    z = np.polyfit(x_data, y_data, 1)
    poly = np.poly1d(z)
    x_line = np.linspace(x_data.min(), x_data.max(), 100)
    ax.plot(x_line, poly(x_line), color=line_color,
            linewidth=1.5, linestyle='--', alpha=0.7, zorder=2)

    ax.text(
        0.97, 0.06, annot, transform=ax.transAxes,
        ha='right', va='bottom', fontsize=10, fontstyle='italic',
        fontweight='normal',
        bbox=dict(boxstyle='round,pad=0.3', facecolor='white', edgecolor='#ccc', alpha=0.9),
    )

    ax.set_xlabel('ATI Score', fontsize=11)
    ax.set_ylabel(ylabel, fontsize=11)
    ax.set_xlim(1, 6)
    ax.set_xticks([1, 2, 3, 4, 5, 6])
    ax.set_ylim(0, 100)

# Show y-axis tick labels on right panel too (sharey suppresses them by default)
axes[1].tick_params(labelleft=True)

fig.tight_layout()
save_figure(fig, 'ATI_vs_SUS_Scatter')
plt.close()
print('✓ ATI scatter plot saved')


# ═══════════════════════════════════════════════════════════════════════════
# FIGURE 3: SUS Difference Diverging Bar
# ═══════════════════════════════════════════════════════════════════════════

fig, ax = plt.subplots(figsize=(8, 6.5))

df_sorted = df.sort_values('ΔSUS', ascending=True).reset_index(drop=True)
ids = df_sorted['ID'].astype(str).values
diffs = df_sorted['ΔSUS'].values
colors = [COLORS['passwordless'] if d >= 0 else '#E05050' for d in diffs]

ax.barh(range(len(ids)), diffs, color=colors, edgecolor='white', height=0.7, zorder=2)
ax.axvline(0, color='gray', linewidth=1, zorder=1)

ax.set_yticks(range(len(ids)))
ax.set_yticklabels([f'P{i}' for i in ids], fontsize=9)
ax.set_xlabel('SUS Difference (Passwordless − Password-based)', fontsize=11)

legend_elements = [
    Patch(facecolor=COLORS['passwordless'], edgecolor='white', label='Passwordless higher'),
    Patch(facecolor='#E05050', edgecolor='white', label='Password-based higher'),
]
ax.legend(handles=legend_elements, loc='upper right', fontsize=9, framealpha=0.95)

fig.tight_layout()
save_figure(fig, 'SUS_Difference_Bar')
plt.close()
print('✓ SUS difference bar chart saved')


# ═══════════════════════════════════════════════════════════════════════════
# FIGURE 4: VdL Violin Plot (Usefulness & Satisfaction)
# ═══════════════════════════════════════════════════════════════════════════

fig, axes = plt.subplots(1, 2, figsize=(12, 5), sharey=True)
fig.subplots_adjust(top=0.88, wspace=0.28, bottom=0.20, left=0.08, right=0.98)

VDL_ZONE_LABELS = [
    (-1.1, 'Negative', COLORS['negative']),
    (1.1, 'Positive', COLORS['positive']),
]

_GROUPS = ['Password-based', 'Passwordless']
_PALETTE = [COLORS['password_based'], COLORS['passwordless']]

for ax, (panel_name, acol, dcol) in zip(axes, [
    ('Usefulness', 'VU A', 'VU D'),
    ('Satisfaction', 'VS A', 'VS D'),
]):
    df_vdl = df[[acol, dcol]].copy()
    df_vdl.columns = _GROUPS
    df_vdl_long = df_vdl.melt(var_name='System', value_name='Score')

    ax.axvspan(-2, 0, color='#ff9999', alpha=0.15, lw=0, zorder=0)
    ax.axvspan(0, 2, color='#99cc99', alpha=0.15, lw=0, zorder=0)
    ax.axvline(0, color='gray', linestyle='--', linewidth=1, alpha=0.5, zorder=1)

    # Violin body only — boxplot overlaid separately for the inspiration look
    sns.violinplot(
        x='Score', y='System', hue='System', data=df_vdl_long, orient='h',
        inner=None, palette=_PALETTE, ax=ax, zorder=2, legend=False,
        cut=0, linewidth=1.2,
    )

    # Proper boxplot (IQR box + whiskers + outliers) overlay
    for i, group in enumerate(_GROUPS):
        data = df_vdl_long.loc[df_vdl_long['System'] == group, 'Score']
        ax.boxplot(
            data, positions=[i], vert=False, widths=0.13,
            patch_artist=True,
            boxprops=dict(facecolor='white', edgecolor='black', linewidth=1.5),
            medianprops=dict(color='black', linewidth=2.5),
            whiskerprops=dict(color='black', linewidth=1.5),
            capprops=dict(color='black', linewidth=1.5),
            flierprops=dict(
                marker='o', markersize=4,
                markerfacecolor='#555', markeredgecolor='black',
                markeredgewidth=0.5,
            ),
            zorder=3,
        )

    # Restore group labels overwritten by ax.boxplot()
    ax.set_yticks([0, 1])
    ax.set_yticklabels(_GROUPS, fontsize=10)
    ax.set_ylabel('')
    ax.set_xlim(-2, 2)
    ax.margins(y=0.08)
    add_zone_labels(ax, VDL_ZONE_LABELS, y=1.02)
    xlabel = 'Usefulness *' if panel_name == 'Usefulness' else panel_name
    ax.set_xlabel(xlabel, fontsize=12, fontweight='bold', labelpad=8)

save_figure(fig, 'VdL_Violin_Plot')
plt.close()
print('✓ VdL violin plot saved')
print('\nAll figures generated.')
