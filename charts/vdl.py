import matplotlib.pyplot as plt
import seaborn as sns

from plot_utils import (
    COLORS,
    finalize_zone_violin_figure,
    load_thesis_df,
    save_figure,
)

OUTPUT_STEM = 'VdL_Usefulness_Violin_Plot_Final'

df = load_thesis_df()
sns.set_theme(style='whitegrid')

df_vu = df[['VU A', 'VU D']].copy()
df_vu.columns = ['Password-based', 'Passwordless']
df_vu_long = df_vu.melt(var_name='System', value_name='Usefulness Score')

fig, ax = plt.subplots(figsize=(9, 6))

ax.axvspan(-2, 0, color='#ff9999', alpha=0.15, lw=0, zorder=0)
ax.axvspan(0, 2, color='#99cc99', alpha=0.15, lw=0, zorder=0)
ax.axvline(0, color='gray', linestyle='--', linewidth=1, alpha=0.5, zorder=1)

sns.violinplot(
    x='Usefulness Score', y='System', hue='System', data=df_vu_long, orient='h', inner='box',
    palette=[COLORS['password_based'], COLORS['passwordless']], ax=ax, zorder=2, legend=False,
    cut=0,
)

ax.set_xlim(-2, 2)
ax.margins(y=0.08)

finalize_zone_violin_figure(
    fig, ax,
    [
        (-1.1, 'Negative', COLORS['negative']),
        (1.1, 'Positive', COLORS['positive']),
    ],
    'Usefulness Score',
)

save_figure(fig, OUTPUT_STEM)
plt.close()
