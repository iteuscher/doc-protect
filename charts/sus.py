import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

from plot_utils import COLORS, load_thesis_df, save_figure

OUTPUT_STEM = 'SUS_Violin_Plot'

df = load_thesis_df()
sns.set_theme(style='whitegrid')

ORDER   = ['Password-based', 'Passwordless']
PALETTE = [COLORS['password_based'], COLORS['passwordless']]
COLS    = ['SUS A', 'SUS D']

df_sus      = df[COLS].copy()
df_sus.columns = ORDER
df_sus_long = df_sus.melt(var_name='System', value_name='SUS Score')

fig, ax = plt.subplots(figsize=(9, 5))

# Vertical zone shading
ax.axvspan(0,    50.9, color='#ff9999', alpha=0.12, lw=0, zorder=0)
ax.axvspan(50.9, 71.4, color='#ffcc99', alpha=0.12, lw=0, zorder=0)
ax.axvspan(71.4, 100,  color='#99cc99', alpha=0.12, lw=0, zorder=0)
ax.axvline(50.9, color='gray', linestyle='--', linewidth=1, alpha=0.4, zorder=1)
ax.axvline(71.4, color='gray', linestyle='--', linewidth=1, alpha=0.4, zorder=1)

# Horizontal violin — semi-transparent, no inner markings
sns.violinplot(
    y='System', x='SUS Score', hue='System', data=df_sus_long,
    order=ORDER, palette=PALETTE, inner=None, cut=0,
    linewidth=1.2, ax=ax, zorder=2, saturation=1.0, legend=False,
)
for coll in ax.collections:
    coll.set_alpha(1.0)

# Boxplot overlay — shows true IQR (middle 50%) and 1.5×IQR whiskers
for i, col in enumerate(COLS):
    ax.boxplot(
        df[col], positions=[i], vert=False, widths=0.13,
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

# Restore y-tick labels (boxplot overwrites them)
ax.set_yticks([0, 1])
ax.set_yticklabels(ORDER, fontsize=11)

# Zone labels above the plot
trans = ax.get_xaxis_transform()
for x_pos, label, color in [
    (25.45, 'Not Acceptable', COLORS['negative']),
    (61.15, 'Marginal',       COLORS['marginal']),
    (85.7,  'Acceptable',     COLORS['positive']),
]:
    ax.text(
        x_pos, 1.04, label, transform=trans,
        ha='center', va='bottom', color=color,
        fontsize=10, fontweight='bold', clip_on=False,
    )

ax.set_xlim(0, 100)
ax.set_xlabel('SUS Score', fontsize=11)
ax.set_ylabel('')
ax.margins(y=0.1)

fig.subplots_adjust(top=0.88, bottom=0.12, left=0.14, right=0.96)
save_figure(fig, OUTPUT_STEM)
plt.close()
