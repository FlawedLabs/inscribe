<script lang="ts">
	export let spacing = '-translate-y-[4.25rem]';
</script>

<div class="hidden group-hover:flex justify-center z-50">
	<div class="absolute {spacing}">
		<slot />
	</div>
</div>
