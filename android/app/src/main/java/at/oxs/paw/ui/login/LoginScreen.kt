package at.oxs.paw.ui.login

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import at.oxs.paw.network.RetrofitClient
import at.oxs.paw.network.TokenStore
import at.oxs.paw.model.LoginRequest
import at.oxs.paw.model.RegisterRequest
import at.oxs.paw.ui.theme.Spacing
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(onLogin: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf("login") }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf("http://192.168.1.x:3000/api/") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        serverUrl = TokenStore.getServerUrl(context)
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.screenPadding),
        verticalArrangement = Arrangement.Center
    ) {
        Text("🐾 PAW", style = MaterialTheme.typography.displaySmall)
        Text("Digitaler Tierimpfpass", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = .6f))
        Spacer(Modifier.height(Spacing.s3xl))

        OutlinedTextField(
            value = serverUrl, onValueChange = { serverUrl = it },
            label = { Text("Server URL") }, modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(Modifier.height(Spacing.sm))

        if (mode == "register") {
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Spacer(Modifier.height(Spacing.sm))
        }
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text("E-Mail") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(), singleLine = true
        )
        Spacer(Modifier.height(Spacing.sm))
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text("Passwort") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(), singleLine = true
        )
        Spacer(Modifier.height(Spacing.sm))

        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Spacer(Modifier.height(Spacing.lg))

        Button(
            onClick = {
                scope.launch {
                    loading = true; error = null
                    try {
                        TokenStore.saveServerUrl(context, serverUrl)
                        val api = RetrofitClient.build(serverUrl)
                        val res = if (mode == "login") api.login(LoginRequest(email, password))
                        else api.register(RegisterRequest(name, email, password))
                        TokenStore.saveToken(context, res.token)
                        TokenStore.saveRole(context, res.account.role ?: "user")
                        RetrofitClient.build(serverUrl, res.token)
                        onLogin()
                    } catch (e: Exception) {
                        error = e.message ?: "Anmeldung fehlgeschlagen"
                    } finally { loading = false }
                }
            },
            modifier = Modifier.fillMaxWidth(), enabled = !loading
        ) { Text(if (loading) "Bitte warten..." else if (mode == "login") "Einloggen" else "Registrieren") }

        TextButton(
            onClick = { mode = if (mode == "login") "register" else "login"; error = null },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (mode == "login") "Noch kein Konto? Registrieren" else "Bereits registriert? Einloggen") }
    }
}
