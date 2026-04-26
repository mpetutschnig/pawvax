package at.oxs.paw

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import at.oxs.paw.ui.AppNavHost
import at.oxs.paw.ui.theme.PawTheme

class MainActivity : ComponentActivity() {
    private var nfcTagCallback: ((String) -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PawTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { inner ->
                    val navController = rememberNavController()
                    AppNavHost(
                        navController = navController,
                        modifier = Modifier.padding(inner),
                        registerNfcCallback = { cb -> nfcTagCallback = cb },
                        unregisterNfcCallback = { nfcTagCallback = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        if (intent.action == NfcAdapter.ACTION_TAG_DISCOVERED ||
            intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED) {
            val tag: Tag? = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
            tag?.let {
                val uid = it.id.joinToString("") { b -> "%02X".format(b) }
                nfcTagCallback?.invoke(uid)
            }
        }
    }
}
